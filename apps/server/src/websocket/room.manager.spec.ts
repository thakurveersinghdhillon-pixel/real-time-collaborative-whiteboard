import { RoomManager } from './room.manager';
import { Stroke } from '@whiteboard/shared';

describe('RoomManager', () => {
  let roomManager: RoomManager;

  const createMockSocket = () => ({ send: jest.fn(), readyState: 1 } as any);

  beforeEach(() => {
    roomManager = new RoomManager();
  });

  it('should create a room when requested', () => {
    const room = roomManager.getOrCreateRoom('room-123');
    expect(room).toBeDefined();
    expect(room.roomId).toBe('room-123');
    expect(roomManager.hasRoom('room-123')).toBe(true);
  });

  it('should handle client joining a room', () => {
    const socket = createMockSocket();
    const { room, user } = roomManager.joinRoom(
      'room-A',
      'client-1',
      'Thakur',
      socket
    );

    expect(user.clientId).toBe('client-1');
    expect(user.displayName).toBe('Thakur');
    expect(room.clients.size).toBe(1);
    expect(roomManager.getPresenceUsers('room-A')).toHaveLength(1);
  });

  it('should clean up empty rooms on client departure', () => {
    const socket = createMockSocket();
    roomManager.joinRoom('room-temp', 'client-x', 'UserX', socket);

    expect(roomManager.hasRoom('room-temp')).toBe(true);

    const { remainingCount } = roomManager.leaveRoom('room-temp', 'client-x');

    expect(remainingCount).toBe(0);
    expect(roomManager.hasRoom('room-temp')).toBe(false);
  });

  it('should maintain strict stroke isolation between rooms', () => {
    const strokeA: Stroke = {
      id: 'stroke-A',
      points: [{ x: 0, y: 0 }],
      color: '#000',
      width: 4,
      tool: 'pen',
    };
    const strokeB: Stroke = {
      id: 'stroke-B',
      points: [{ x: 10, y: 10 }],
      color: '#ef4444',
      width: 8,
      tool: 'pen',
    };

    roomManager.addStroke('room-A', strokeA);
    roomManager.addStroke('room-B', strokeB);

    expect(roomManager.getStrokes('room-A')).toEqual([strokeA]);
    expect(roomManager.getStrokes('room-B')).toEqual([strokeB]);

    roomManager.clearBoard('room-A');

    expect(roomManager.getStrokes('room-A')).toEqual([]);
    expect(roomManager.getStrokes('room-B')).toEqual([strokeB]);
  });
});
