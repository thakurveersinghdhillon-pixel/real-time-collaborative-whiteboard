import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import {
  StrokeAddPayload,
  StrokeRemovePayload,
  BoardClearPayload,
  BoardRequestStatePayload,
  RoomJoinPayload,
  RoomLeavePayload,
  CursorMovePayload,
  AuthAuthenticatePayload,
  DistributedEvent,
  isValidWsMessage,
  BoardRole,
  AuthUser,
} from '@whiteboard/shared';
import { RoomManager } from './room.manager';
import { RedisService } from '../redis/redis.service';
import { BoardPersistenceService } from '../boards/board-persistence.service';
import { AuthService } from '../auth/auth.service';
import { BoardAccessService } from '../boards/board-access.service';

export interface SocketMetadata {
  roomId: string;
  clientId: string;
  userId?: string;
  displayName: string;
  role: BoardRole;
}

export interface SocketAuthState {
  isAuthenticated: boolean;
  user?: AuthUser;
  authTimer?: NodeJS.Timeout;
}

const AUTH_TIMEOUT_MS = 10000; // 10-second authentication handshake timeout

@WebSocketGateway({ cors: { origin: '*' } })
export class WhiteboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private roomManager = new RoomManager();
  private socketToClient: Map<WebSocket, SocketMetadata> = new Map();
  private socketAuthMap: Map<WebSocket, SocketAuthState> = new Map();

  constructor(
    private readonly redisService: RedisService,
    private readonly boardPersistenceService: BoardPersistenceService,
    private readonly authService: AuthService,
    private readonly boardAccessService: BoardAccessService,
  ) {}

  handleConnection(client: WebSocket) {
    // Initialize unauthenticated socket state and start authentication timeout
    const authTimer = setTimeout(() => {
      const authState = this.socketAuthMap.get(client);
      if (!authState?.isAuthenticated) {
        console.warn('[WebSocket Gateway] Closing socket due to authentication timeout');
        client.send(
          JSON.stringify({
            event: 'room:error',
            data: {
              message: 'UNAUTHORIZED: Authentication timeout',
              code: 'UNAUTHORIZED',
            },
          })
        );
        try {
          client.close();
        } catch {
          // Fallback if socket already closed
        }
      }
    }, AUTH_TIMEOUT_MS);

    if (authTimer && typeof authTimer.unref === 'function') {
      authTimer.unref();
    }

    this.socketAuthMap.set(client, {
      isAuthenticated: false,
      authTimer,
    });

    console.log(
      `[WebSocket Gateway (${this.redisService.getInstanceId()})] Socket connected (unauthenticated)`
    );
  }

  handleDisconnect(client: WebSocket) {
    const authState = this.socketAuthMap.get(client);
    if (authState?.authTimer) {
      clearTimeout(authState.authTimer);
    }
    this.socketAuthMap.delete(client);

    const meta = this.socketToClient.get(client);
    if (meta) {
      const { roomId, clientId } = meta;
      console.log(
        `[WebSocket Gateway (${this.redisService.getInstanceId()})] Disconnect client ${clientId} in room ${roomId}`
      );
      this.handleClientLeave(roomId, clientId, client);
      this.socketToClient.delete(client);
    }
  }

  @SubscribeMessage('auth:authenticate')
  async handleAuthAuthenticate(
    @MessageBody() data: AuthAuthenticatePayload,
    @ConnectedSocket() client: WebSocket
  ) {
    if (!isValidWsMessage({ event: 'auth:authenticate', data })) {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: { message: 'UNAUTHORIZED', code: 'UNAUTHORIZED' },
        })
      );
      try {
        client.close();
      } catch {}
      return;
    }

    const { token } = data;
    const payload = this.authService.verifyJwt(token);
    if (!payload) {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: { message: 'UNAUTHORIZED', code: 'UNAUTHORIZED' },
        })
      );
      try {
        client.close();
      } catch {}
      return;
    }

    try {
      const user = await this.authService.validateUserById(payload.sub);

      const authState = this.socketAuthMap.get(client) || { isAuthenticated: false };
      if (authState.authTimer) {
        clearTimeout(authState.authTimer);
        authState.authTimer = undefined;
      }
      authState.isAuthenticated = true;
      authState.user = user;
      this.socketAuthMap.set(client, authState);

      client.send(
        JSON.stringify({
          event: 'auth:success',
          data: {
            authenticated: true,
            user: {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
            },
          },
        })
      );
    } catch {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: { message: 'UNAUTHORIZED', code: 'UNAUTHORIZED' },
        })
      );
      try {
        client.close();
      } catch {}
    }
  }

  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @MessageBody() data: RoomJoinPayload,
    @ConnectedSocket() client: WebSocket
  ) {
    if (!isValidWsMessage({ event: 'room:join', data })) {
      console.warn('[WebSocket Gateway] Invalid room:join payload rejected');
      return;
    }

    const authState = this.socketAuthMap.get(client);
    if (!authState?.isAuthenticated || !authState.user) {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId: data.roomId,
            message: 'UNAUTHORIZED: Authentication required before joining room',
            code: 'UNAUTHORIZED',
          },
        })
      );
      return;
    }

    const { roomId, clientId } = data;
    const userId = authState.user.id;
    const verifiedDisplayName = authState.user.displayName;

    // Determine user role on board from database
    const role: BoardRole | null = await this.boardAccessService.getUserRoleOnBoard(
      userId,
      roomId
    );

    // IDOR Protection: Access Denied if role is null
    if (!role) {
      console.warn(`[WebSocket Gateway] Access denied for user ${userId} joining room ${roomId}`);
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'Access denied: You are not a member of this whiteboard',
            code: 'FORBIDDEN',
          },
        })
      );
      return;
    }

    // Remove from previous room if socket was joined elsewhere
    const prevMeta = this.socketToClient.get(client);
    if (prevMeta && prevMeta.roomId !== roomId) {
      this.handleClientLeave(prevMeta.roomId, prevMeta.clientId, client);
    }

    this.socketToClient.set(client, {
      roomId,
      clientId,
      userId,
      displayName: verifiedDisplayName,
      role,
    });

    // Hydrate room strokes & version from PostgreSQL if not already in memory
    if (!this.roomManager.isRoomHydrated(roomId)) {
      const snapshot = await this.boardPersistenceService.loadBoardState(roomId);
      this.roomManager.setStrokes(roomId, snapshot.strokes, snapshot.version);
    }

    const { room, user } = this.roomManager.joinRoom(
      roomId,
      clientId,
      verifiedDisplayName,
      client,
      userId,
      role
    );

    // Subscribe server instance to Redis Pub/Sub room channel
    await this.redisService.subscribeToRoom(roomId, (remoteEvent) => {
      this.handleRemoteRedisEvent(remoteEvent);
    });

    const currentVersion = this.roomManager.getVersion(roomId);

    // Send initial room snapshot to joining client including their role & board version
    client.send(
      JSON.stringify({
        event: 'room:joined',
        data: {
          roomId,
          strokes: room.strokes,
          presence: this.roomManager.getPresenceUsers(roomId),
          userRole: role,
          version: currentVersion,
        },
      })
    );

    // Broadcast user joined & presence update to local room members
    this.roomManager.broadcastToRoom(
      roomId,
      'room:user-joined',
      { roomId, user },
      client
    );

    const presencePayload = {
      roomId,
      users: this.roomManager.getPresenceUsers(roomId),
    };

    this.roomManager.broadcastToRoom(roomId, 'presence:state', presencePayload);

    // Publish to Redis for cross-instance propagation
    await this.redisService.publishEvent(roomId, 'room:user-joined', { roomId, user });
    await this.redisService.publishEvent(roomId, 'presence:state', presencePayload);
  }

  @SubscribeMessage('room:leave')
  handleRoomLeave(
    @MessageBody() data: RoomLeavePayload,
    @ConnectedSocket() client: WebSocket
  ) {
    if (!isValidWsMessage({ event: 'room:leave', data })) return;
    const { roomId, clientId } = data;
    this.handleClientLeave(roomId, clientId, client);
    this.socketToClient.delete(client);
  }

  @SubscribeMessage('cursor:move')
  async handleCursorMove(
    @MessageBody() data: CursorMovePayload,
    @ConnectedSocket() client: WebSocket
  ) {
    if (!isValidWsMessage({ event: 'cursor:move', data })) return;
    const { roomId, x, y } = data;

    const authState = this.socketAuthMap.get(client);
    const meta = this.socketToClient.get(client);
    if (!authState?.isAuthenticated || !meta || meta.roomId !== roomId) return;

    // Use server-verified identity to prevent identity spoofing
    const verifiedPayload: CursorMovePayload = {
      roomId,
      clientId: meta.clientId,
      displayName: meta.displayName,
      x,
      y,
    };

    this.roomManager.updateCursor(roomId, meta.clientId, x, y);

    // Transient cursor move - broadcast locally & publish to Redis
    this.roomManager.broadcastToRoom(roomId, 'cursor:move', verifiedPayload, client);
    await this.redisService.publishEvent(roomId, 'cursor:move', verifiedPayload);
  }

  @SubscribeMessage('stroke:add')
  async handleStrokeAdd(
    @MessageBody() data: StrokeAddPayload,
    @ConnectedSocket() client: WebSocket
  ) {
    if (!isValidWsMessage({ event: 'stroke:add', data })) return;
    const { roomId, stroke } = data;

    const authState = this.socketAuthMap.get(client);
    const meta = this.socketToClient.get(client);
    if (!authState?.isAuthenticated || !meta || meta.roomId !== roomId) {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'UNAUTHORIZED: Authentication required',
            code: 'UNAUTHORIZED',
          },
        })
      );
      return;
    }

    if (meta.role === 'VIEWER') {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'Drawing is disabled for read-only viewers',
            code: 'FORBIDDEN',
          },
        })
      );
      return;
    }

    const eventId = data.eventId || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Persist durable stroke to PostgreSQL transactionally BEFORE broadcasting
    const txRes = await this.boardPersistenceService.saveStrokeTx(
      roomId,
      stroke,
      eventId,
      meta.userId,
      meta.displayName,
      meta.clientId
    );

    if (!txRes) {
      console.error(`[WebSocket Gateway] MUTATION_REJECTED: Failed to persist stroke ${stroke.id} in DB`);
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'MUTATION_REJECTED: Database mutation failed',
            code: 'MUTATION_FAILED',
          },
        })
      );
      return;
    }

    const payloadWithVersion: StrokeAddPayload = {
      ...data,
      eventId,
      version: txRes.version,
    };

    if (txRes.isDuplicate) {
      console.log(`[WebSocket Gateway] EVENT_DUPLICATE: Stroke ${stroke.id} already processed`);
      return;
    }

    // Update local in-memory state with authoritative version
    this.roomManager.addStroke(roomId, stroke, txRes.version);

    // Broadcast locally
    this.roomManager.broadcastToRoom(roomId, 'stroke:add', payloadWithVersion, client);

    // Publish across Redis Pub/Sub with version
    await this.redisService.publishEvent(roomId, 'stroke:add', payloadWithVersion, txRes.version);
  }

  @SubscribeMessage('stroke:remove')
  async handleStrokeRemove(
    @MessageBody() data: StrokeRemovePayload,
    @ConnectedSocket() client: WebSocket
  ) {
    if (!isValidWsMessage({ event: 'stroke:remove', data })) return;
    const { roomId, strokeId } = data;

    const authState = this.socketAuthMap.get(client);
    const meta = this.socketToClient.get(client);
    if (!authState?.isAuthenticated || !meta || meta.roomId !== roomId) {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'UNAUTHORIZED: Authentication required',
            code: 'UNAUTHORIZED',
          },
        })
      );
      return;
    }

    if (meta.role === 'VIEWER') {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'Erase/Undo is disabled for read-only viewers',
            code: 'FORBIDDEN',
          },
        })
      );
      return;
    }

    const eventId = data.eventId || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Delete stroke from PostgreSQL transactionally BEFORE broadcasting
    const txRes = await this.boardPersistenceService.deleteStrokeTx(
      roomId,
      strokeId,
      eventId,
      meta.userId,
      meta.displayName,
      meta.clientId
    );

    if (!txRes) {
      console.error(`[WebSocket Gateway] MUTATION_REJECTED: Failed to delete stroke ${strokeId} in DB`);
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'MUTATION_REJECTED: Database mutation failed',
            code: 'MUTATION_FAILED',
          },
        })
      );
      return;
    }

    const payloadWithVersion: StrokeRemovePayload = {
      ...data,
      eventId,
      version: txRes.version,
    };

    if (txRes.isDuplicate) {
      console.log(`[WebSocket Gateway] EVENT_DUPLICATE: Stroke delete ${strokeId} already processed`);
      return;
    }

    // Update local in-memory state
    this.roomManager.removeStroke(roomId, strokeId, txRes.version);

    // Broadcast locally
    this.roomManager.broadcastToRoom(roomId, 'stroke:remove', payloadWithVersion, client);

    // Publish across Redis with version
    await this.redisService.publishEvent(roomId, 'stroke:remove', payloadWithVersion, txRes.version);
  }

  @SubscribeMessage('board:clear')
  async handleBoardClear(
    @MessageBody() data: BoardClearPayload,
    @ConnectedSocket() client: WebSocket
  ) {
    if (!isValidWsMessage({ event: 'board:clear', data })) return;
    const { roomId } = data;

    const authState = this.socketAuthMap.get(client);
    const meta = this.socketToClient.get(client);
    if (!authState?.isAuthenticated || !meta || meta.roomId !== roomId) {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'UNAUTHORIZED: Authentication required',
            code: 'UNAUTHORIZED',
          },
        })
      );
      return;
    }

    if (meta.role !== 'OWNER') {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'Only the board owner can clear the whiteboard',
            code: 'FORBIDDEN',
          },
        })
      );
      return;
    }

    const eventId = data.eventId || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Clear strokes from PostgreSQL transactionally BEFORE broadcasting
    const txRes = await this.boardPersistenceService.clearBoardTx(
      roomId,
      eventId,
      meta.userId,
      meta.displayName,
      meta.clientId
    );

    if (!txRes) {
      console.error(`[WebSocket Gateway] MUTATION_REJECTED: Failed to clear board ${roomId} in DB`);
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'MUTATION_REJECTED: Database mutation failed',
            code: 'MUTATION_FAILED',
          },
        })
      );
      return;
    }

    const payloadWithVersion: BoardClearPayload = {
      ...data,
      eventId,
      version: txRes.version,
    };

    if (txRes.isDuplicate) {
      console.log(`[WebSocket Gateway] EVENT_DUPLICATE: Board clear ${roomId} already processed`);
      return;
    }

    // Clear local in-memory state
    this.roomManager.clearBoard(roomId, txRes.version);

    // Broadcast locally
    this.roomManager.broadcastToRoom(roomId, 'board:clear', payloadWithVersion, client);

    // Publish across Redis with version
    await this.redisService.publishEvent(roomId, 'board:clear', payloadWithVersion, txRes.version);
  }

  @SubscribeMessage('board:request-state')
  async handleBoardRequestState(
    @MessageBody() data: BoardRequestStatePayload,
    @ConnectedSocket() client: WebSocket
  ) {
    if (!isValidWsMessage({ event: 'board:request-state', data })) return;
    const { roomId } = data;

    const authState = this.socketAuthMap.get(client);
    const meta = this.socketToClient.get(client);
    if (!authState?.isAuthenticated || !meta || meta.roomId !== roomId) {
      client.send(
        JSON.stringify({
          event: 'room:error',
          data: {
            roomId,
            message: 'Access denied: Must authenticate and join room before requesting state',
            code: 'FORBIDDEN',
          },
        })
      );
      return;
    }

    const snapshot = await this.boardPersistenceService.loadBoardState(roomId);
    this.roomManager.setStrokes(roomId, snapshot.strokes, snapshot.version);

    client.send(
      JSON.stringify({
        event: 'board:state',
        data: { roomId, strokes: snapshot.strokes, version: snapshot.version },
      })
    );
  }

  private async handleRemoteRedisEvent(remoteEvent: DistributedEvent): Promise<void> {
    const { eventType, roomId, payload, version } = remoteEvent;

    // Handle durable mutation events with versioning and version gap detection
    if (eventType === 'stroke:add' || eventType === 'stroke:remove' || eventType === 'board:clear') {
      const localVersion = this.roomManager.getVersion(roomId);

      if (version !== undefined) {
        if (version <= localVersion && this.roomManager.isRoomHydrated(roomId)) {
          console.log(
            `[WebSocket Gateway] EVENT_DUPLICATE: Ignoring old/duplicate remote event ${eventType} (version ${version} <= local ${localVersion})`
          );
          return;
        }

        if (version > localVersion + 1 && this.roomManager.isRoomHydrated(roomId)) {
          console.warn(
            `[WebSocket Gateway] EVENT_VERSION_GAP: Detected version gap for room ${roomId} (local: ${localVersion}, received: ${version}). Resynchronizing from PostgreSQL.`
          );
          const snapshot = await this.boardPersistenceService.loadBoardState(roomId);
          this.roomManager.setStrokes(roomId, snapshot.strokes, snapshot.version);
          this.roomManager.broadcastToRoom(roomId, 'board:state', {
            roomId,
            strokes: snapshot.strokes,
            version: snapshot.version,
          });
          return;
        }
      }
    }

    switch (eventType) {
      case 'stroke:add': {
        const data = payload as StrokeAddPayload;
        this.roomManager.addStroke(roomId, data.stroke, version);
        this.roomManager.broadcastToRoom(roomId, 'stroke:add', data);
        break;
      }
      case 'stroke:remove': {
        const data = payload as StrokeRemovePayload;
        this.roomManager.removeStroke(roomId, data.strokeId, version);
        this.roomManager.broadcastToRoom(roomId, 'stroke:remove', data);
        break;
      }
      case 'board:clear': {
        const data = payload as BoardClearPayload;
        this.roomManager.clearBoard(roomId, version);
        this.roomManager.broadcastToRoom(roomId, 'board:clear', data);
        break;
      }
      case 'cursor:move': {
        const data = payload as CursorMovePayload;
        this.roomManager.updateCursor(roomId, data.clientId, data.x, data.y);
        this.roomManager.broadcastToRoom(roomId, 'cursor:move', data);
        break;
      }
      case 'room:user-joined':
      case 'room:user-left':
      case 'presence:state': {
        this.roomManager.broadcastToRoom(roomId, eventType, payload);
        break;
      }
    }
  }


  private async handleClientLeave(
    roomId: string,
    clientId: string,
    clientSocket: WebSocket
  ) {
    const { remainingCount } = this.roomManager.leaveRoom(roomId, clientId);
    if (remainingCount > 0) {
      const userLeftPayload = { roomId, clientId };
      const presencePayload = {
        roomId,
        users: this.roomManager.getPresenceUsers(roomId),
      };

      this.roomManager.broadcastToRoom(
        roomId,
        'room:user-left',
        userLeftPayload,
        clientSocket
      );
      this.roomManager.broadcastToRoom(
        roomId,
        'presence:state',
        presencePayload,
        clientSocket
      );

      await this.redisService.publishEvent(roomId, 'room:user-left', userLeftPayload);
      await this.redisService.publishEvent(roomId, 'presence:state', presencePayload);
    } else {
      await this.redisService.unsubscribeFromRoom(roomId);
    }
  }

  getRoomManager(): RoomManager {
    return this.roomManager;
  }
}
