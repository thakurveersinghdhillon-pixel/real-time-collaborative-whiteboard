import { WebSocket } from 'ws';
import { Stroke, PresenceUser, BoardRole } from '@whiteboard/shared';
import { PresenceManager } from './presence.manager';

export interface RoomClient {
  socket: WebSocket;
  user: PresenceUser;
}

export interface RoomData {
  roomId: string;
  strokes: Stroke[];
  clients: Map<string, RoomClient>;
  isHydrated?: boolean;
  version: number;
}

export class RoomManager {
  private rooms: Map<string, RoomData> = new Map();

  getOrCreateRoom(roomId: string): RoomData {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        roomId,
        strokes: [],
        clients: new Map(),
        isHydrated: false,
        version: 0,
      };
      this.rooms.set(roomId, room);
      console.log(`[RoomManager] Room created: ${roomId}`);
    }
    return room;
  }

  joinRoom(
    roomId: string,
    clientId: string,
    displayName: string | undefined,
    socket: WebSocket,
    userId?: string,
    role?: BoardRole
  ): { room: RoomData; user: PresenceUser } {
    const room = this.getOrCreateRoom(roomId);
    const user = PresenceManager.createPresenceUser(clientId, displayName, userId, role);

    room.clients.set(clientId, { socket, user });
    console.log(
      `[RoomManager] Client ${clientId} joined room ${roomId} with role ${role || 'default'}`
    );

    return { room, user };
  }

  leaveRoom(
    roomId: string,
    clientId: string
  ): { userLeft?: PresenceUser; remainingCount: number } {
    const room = this.rooms.get(roomId);
    if (!room) return { remainingCount: 0 };

    const client = room.clients.get(clientId);
    const userLeft = client?.user;

    room.clients.delete(clientId);
    console.log(`[RoomManager] Client ${clientId} left room ${roomId}`);

    const remainingCount = room.clients.size;
    if (remainingCount === 0) {
      this.rooms.delete(roomId);
      console.log(`[RoomManager] Empty room cleaned up: ${roomId}`);
    }

    return { userLeft, remainingCount };
  }

  addStroke(roomId: string, stroke: Stroke, version?: number): void {
    const room = this.getOrCreateRoom(roomId);
    if (!room.strokes.some((s) => s.id === stroke.id)) {
      room.strokes.push(stroke);
    }
    if (version !== undefined) {
      room.version = Math.max(room.version, version);
    }
  }

  removeStroke(roomId: string, strokeId: string, version?: number): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.strokes = room.strokes.filter((s) => s.id !== strokeId);
      if (version !== undefined) {
        room.version = Math.max(room.version, version);
      }
    }
  }

  clearBoard(roomId: string, version?: number): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.strokes = [];
      if (version !== undefined) {
        room.version = Math.max(room.version, version);
      }
    }
  }

  setStrokes(roomId: string, strokes: Stroke[], version: number = 0): void {
    const room = this.getOrCreateRoom(roomId);
    room.strokes = strokes;
    room.version = version;
    room.isHydrated = true;
  }

  getVersion(roomId: string): number {
    const room = this.rooms.get(roomId);
    return room ? room.version : 0;
  }

  isRoomHydrated(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    return !!room && !!room.isHydrated;
  }

  updateCursor(
    roomId: string,
    clientId: string,
    x: number,
    y: number
  ): PresenceUser | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const client = room.clients.get(clientId);
    if (!client) return null;

    client.user.cursor = { x, y };
    return client.user;
  }

  getPresenceUsers(roomId: string): PresenceUser[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.clients.values()).map((c) => c.user);
  }

  getStrokes(roomId: string): Stroke[] {
    const room = this.rooms.get(roomId);
    return room ? [...room.strokes] : [];
  }

  broadcastToRoom(
    roomId: string,
    event: string,
    data: unknown,
    senderSocket?: WebSocket
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const message = JSON.stringify({ event, data });

    room.clients.forEach(({ socket }) => {
      if (socket !== senderSocket && socket.readyState === 1 /* WebSocket.OPEN */) {
        socket.send(message);
      }
    });
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  reset(): void {
    this.rooms.clear();
  }
}
