import {
  WsMessage,
  Stroke,
  PresenceUser,
  isValidWsMessage,
} from '@whiteboard/shared';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'authenticating'
  | 'authenticated'
  | 'disconnected'
  | 'error';

export type WsEventListener = (message: WsMessage) => void;
export type StatusChangeListener = (status: ConnectionStatus) => void;

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export class WhiteboardWsClient {
  private url: string;
  private ws: WebSocket | null = null;
  private clientId: string;
  private displayName: string;
  private token: string | null = null;
  private currentRoomId: string | null = null;
  private status: ConnectionStatus = 'disconnected';
  private boardVersion: number = 0;
  private listeners: Set<WsEventListener> = new Set();
  private statusListeners: Set<StatusChangeListener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionallyClosed = false;
  private reconnectDelay = 2000;

  constructor(url: string = 'ws://localhost:3001') {
    this.url = url;
    this.clientId = generateUUID();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    this.displayName = `User-${randomSuffix}`;
  }

  public getClientId(): string {
    return this.clientId;
  }

  public getDisplayName(): string {
    return this.displayName;
  }

  public getBoardVersion(): number {
    return this.boardVersion;
  }

  public setDisplayName(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length > 0) {
      this.displayName = trimmed.substring(0, 20);
      if (this.currentRoomId && this.status === 'authenticated') {
        this.joinRoom(this.currentRoomId, this.displayName);
      }
    }
  }

  public setAuthToken(token: string | null): void {
    this.token = token;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && token) {
      this.authenticate();
    }
  }

  public getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isIntentionallyClosed = false;
    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WebSocket Client] Connection open, initiating authentication handshake');
        this.setStatus('authenticating');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Send explicit auth handshake message
        this.authenticate();
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (isValidWsMessage(parsed)) {
            if (parsed.event === 'auth:success') {
              console.log('[WebSocket Client] Authentication handshake succeeded');
              this.setStatus('authenticated');

              // Automatically rejoin current room upon successful auth
              if (this.currentRoomId) {
                this.joinRoom(this.currentRoomId, this.displayName);
              }
            } else if (parsed.event === 'room:error') {
              if (parsed.data.code === 'UNAUTHORIZED') {
                console.warn('[WebSocket Client] Authentication rejected by server');
                this.setStatus('error');
              } else if (parsed.data.code === 'MUTATION_FAILED') {
                console.warn('[WebSocket Client] Mutation rejected by server, requesting state sync');
                if (this.currentRoomId) {
                  this.requestBoardState(this.currentRoomId);
                }
              }
            } else if (parsed.event === 'room:joined' || parsed.event === 'board:state') {
              if (typeof parsed.data.version === 'number') {
                this.boardVersion = parsed.data.version;
              }
            } else if (
              parsed.event === 'stroke:add' ||
              parsed.event === 'stroke:remove' ||
              parsed.event === 'board:clear'
            ) {
              const msgVersion = parsed.data.version;
              if (typeof msgVersion === 'number') {
                if (msgVersion > this.boardVersion + 1 && this.currentRoomId) {
                  console.warn(
                    `[WebSocket Client] Version gap detected (current: ${this.boardVersion}, received: ${msgVersion}). Requesting state sync.`
                  );
                  this.requestBoardState(this.currentRoomId);
                } else {
                  this.boardVersion = Math.max(this.boardVersion, msgVersion);
                }
              }
            }

            this.notifyListeners(parsed);
          } else {
            console.warn('[WebSocket Client] Invalid message received', event.data);
          }
        } catch (err) {
          console.error('[WebSocket Client] Error parsing incoming message', err);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WebSocket Client] Connection error', err);
        this.setStatus('error');
      };

      this.ws.onclose = () => {
        console.log('[WebSocket Client] Connection closed');
        this.setStatus('disconnected');
        this.ws = null;

        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[WebSocket Client] Exception establishing connection', err);
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  public authenticate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.send({
      event: 'auth:authenticate',
      data: {
        token: this.token || '',
      },
    });
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.currentRoomId && this.status === 'authenticated') {
      this.leaveRoom(this.currentRoomId);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setStatus('disconnected');
  }

  public joinRoom(roomId: string, displayName?: string, token?: string): void {
    if (displayName) {
      this.displayName = displayName;
    }
    if (token) {
      this.token = token;
    }
    this.currentRoomId = roomId;

    if (this.status === 'authenticated') {
      this.send({
        event: 'room:join',
        data: {
          roomId,
          clientId: this.clientId,
          displayName: this.displayName,
          knownVersion: this.boardVersion,
        },
      });
    } else if (this.status === 'connected' || this.status === 'authenticating') {
      this.authenticate();
    }
  }

  public leaveRoom(roomId: string): void {
    this.send({
      event: 'room:leave',
      data: {
        roomId,
        clientId: this.clientId,
      },
    });
    if (this.currentRoomId === roomId) {
      this.currentRoomId = null;
    }
  }

  public sendCursorMove(roomId: string, x: number, y: number): void {
    if (this.status !== 'authenticated') return;
    this.send({
      event: 'cursor:move',
      data: {
        roomId,
        clientId: this.clientId,
        displayName: this.displayName,
        x,
        y,
      },
    });
  }

  public sendStrokeAdd(roomId: string, stroke: Stroke): void {
    if (this.status !== 'authenticated') return;
    const eventId = generateUUID();
    this.send({
      event: 'stroke:add',
      data: {
        roomId,
        stroke,
        clientId: this.clientId,
        eventId,
      },
    });
  }

  public sendStrokeRemove(roomId: string, strokeId: string): void {
    if (this.status !== 'authenticated') return;
    const eventId = generateUUID();
    this.send({
      event: 'stroke:remove',
      data: {
        roomId,
        strokeId,
        clientId: this.clientId,
        eventId,
      },
    });
  }

  public sendBoardClear(roomId: string): void {
    if (this.status !== 'authenticated') return;
    const eventId = generateUUID();
    this.send({
      event: 'board:clear',
      data: {
        roomId,
        clientId: this.clientId,
        eventId,
      },
    });
  }

  public requestBoardState(roomId: string): void {
    if (this.status !== 'authenticated') return;
    this.send({
      event: 'board:request-state',
      data: {
        roomId,
        clientId: this.clientId,
        knownVersion: this.boardVersion,
      },
    });
  }

  private send(message: WsMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public subscribe(listener: WsEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(newStatus: ConnectionStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.statusListeners.forEach((listener) => listener(newStatus));
  }

  private notifyListeners(message: WsMessage): void {
    this.listeners.forEach((listener) => listener(message));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isIntentionallyClosed) return;

    console.log(`[WebSocket Client] Scheduling reconnect in ${this.reconnectDelay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
  }
}
