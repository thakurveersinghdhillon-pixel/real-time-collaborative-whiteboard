import { Test, TestingModule } from '@nestjs/testing';
import { WhiteboardGateway } from './websocket.gateway';
import { RedisService } from '../redis/redis.service';
import { BoardPersistenceService } from '../boards/board-persistence.service';
import { AuthService } from '../auth/auth.service';
import { BoardAccessService } from '../boards/board-access.service';
import { Stroke } from '@whiteboard/shared';

describe('WhiteboardGateway (Phase 6 WebSocket Security & Auth Handshake Audit)', () => {
  let gateway: WhiteboardGateway;

  const mockRedisService = {
    getInstanceId: jest.fn().mockReturnValue('server-unit-1'),
    getStatus: jest.fn().mockReturnValue('connected'),
    publishEvent: jest.fn().mockResolvedValue('evt-123'),
    subscribeToRoom: jest.fn().mockResolvedValue(undefined),
    unsubscribeFromRoom: jest.fn().mockResolvedValue(undefined),
  };

  const mockBoardPersistenceService = {
    loadBoardState: jest.fn().mockResolvedValue({ strokes: [], version: 1 }),
    saveStrokeTx: jest.fn().mockResolvedValue({ version: 1, isDuplicate: false }),
    deleteStrokeTx: jest.fn().mockResolvedValue({ version: 2, isDuplicate: false }),
    clearBoardTx: jest.fn().mockResolvedValue({ version: 3, isDuplicate: false }),
    saveStroke: jest.fn().mockResolvedValue(undefined),
    deleteStroke: jest.fn().mockResolvedValue(undefined),
    clearBoard: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuthService = {
    verifyJwt: jest.fn().mockReturnValue({ sub: 'user-1', email: 'user@test.com' }),
    validateUserById: jest.fn().mockResolvedValue({ id: 'user-1', displayName: 'Alice Verified', email: 'user@test.com' }),
  };

  const mockBoardAccessService = {
    getUserRoleOnBoard: jest.fn().mockResolvedValue('OWNER'),
  };

  const createMockSocket = () => {
    return {
      readyState: 1, // WebSocket.OPEN
      send: jest.fn(),
      close: jest.fn(),
    } as any;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhiteboardGateway,
        { provide: RedisService, useValue: mockRedisService },
        { provide: BoardPersistenceService, useValue: mockBoardPersistenceService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: BoardAccessService, useValue: mockBoardAccessService },
      ],
    }).compile();

    gateway = module.get<WhiteboardGateway>(WhiteboardGateway);

    jest.clearAllMocks();
  });

  it('Test 1: should reject unauthenticated socket attempting room:join', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);

    await gateway.handleRoomJoin(
      { roomId: 'room-1', clientId: 'client-unauth' },
      socket
    );

    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('UNAUTHORIZED')
    );
  });

  it('Test 2: should reject authentication with invalid JWT token', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);

    mockAuthService.verifyJwt.mockReturnValueOnce(null);

    await gateway.handleAuthAuthenticate(
      { token: 'invalid-jwt-token' },
      socket
    );

    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('UNAUTHORIZED')
    );
    expect(socket.close).toHaveBeenCalled();
  });

  it('Test 3: should reject authentication with expired JWT token', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);

    mockAuthService.verifyJwt.mockReturnValueOnce(null);

    await gateway.handleAuthAuthenticate(
      { token: 'expired-jwt-token' },
      socket
    );

    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('UNAUTHORIZED')
    );
  });

  it('Test 4: should successfully authenticate socket with valid JWT token', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);

    mockAuthService.verifyJwt.mockReturnValueOnce({ sub: 'user-1', email: 'user@test.com' });

    await gateway.handleAuthAuthenticate(
      { token: 'valid-jwt-token' },
      socket
    );

    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('"event":"auth:success"')
    );
  });

  it('Test 5: should prevent identity spoofing on cursor move', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);

    mockAuthService.verifyJwt.mockReturnValueOnce({ sub: 'user-1', email: 'user@test.com' });
    mockAuthService.validateUserById.mockResolvedValueOnce({ id: 'user-1', displayName: 'Alice Verified', email: 'user@test.com' });
    mockBoardAccessService.getUserRoleOnBoard.mockResolvedValueOnce('OWNER');

    await gateway.handleAuthAuthenticate({ token: 'valid-token' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-1', clientId: 'client-1' }, socket);

    await gateway.handleCursorMove(
      { roomId: 'room-1', clientId: 'client-1', displayName: 'Hacker Name', x: 10, y: 20 },
      socket
    );

    expect(mockRedisService.publishEvent).toHaveBeenCalledWith(
      'room-1',
      'cursor:move',
      expect.objectContaining({ displayName: 'Alice Verified' })
    );
  });

  it('Test 6: should prevent role spoofing and enforce database role', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);

    mockAuthService.verifyJwt.mockReturnValueOnce({ sub: 'user-2', email: 'viewer@test.com' });
    mockAuthService.validateUserById.mockResolvedValueOnce({ id: 'user-2', displayName: 'Viewer User', email: 'viewer@test.com' });
    mockBoardAccessService.getUserRoleOnBoard.mockResolvedValueOnce('VIEWER');

    await gateway.handleAuthAuthenticate({ token: 'valid-token' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-1', clientId: 'client-2' }, socket);

    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('"userRole":"VIEWER"')
    );
  });

  it('Test 7: should reject VIEWER from stroke:add, stroke:remove, and board:clear', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);

    mockAuthService.verifyJwt.mockReturnValueOnce({ sub: 'user-viewer', email: 'viewer@test.com' });
    mockAuthService.validateUserById.mockResolvedValueOnce({ id: 'user-viewer', displayName: 'Viewer User', email: 'viewer@test.com' });
    mockBoardAccessService.getUserRoleOnBoard.mockResolvedValueOnce('VIEWER');

    await gateway.handleAuthAuthenticate({ token: 'valid-token' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-1', clientId: 'client-viewer' }, socket);

    const testStroke: Stroke = {
      id: 'stroke-1',
      points: [{ x: 1, y: 1 }],
      color: '#000',
      width: 2,
      tool: 'pen',
    };

    await gateway.handleStrokeAdd({ roomId: 'room-1', stroke: testStroke, clientId: 'client-viewer' }, socket);
    expect(mockBoardPersistenceService.saveStrokeTx).not.toHaveBeenCalled();

    await gateway.handleStrokeRemove({ roomId: 'room-1', strokeId: 'stroke-1', clientId: 'client-viewer' }, socket);
    expect(mockBoardPersistenceService.deleteStrokeTx).not.toHaveBeenCalled();

    await gateway.handleBoardClear({ roomId: 'room-1', clientId: 'client-viewer' }, socket);
    expect(mockBoardPersistenceService.clearBoardTx).not.toHaveBeenCalled();
  });

  it('Test 8: should allow EDITOR to draw but reject clear', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);

    mockAuthService.verifyJwt.mockReturnValueOnce({ sub: 'user-editor', email: 'editor@test.com' });
    mockAuthService.validateUserById.mockResolvedValueOnce({ id: 'user-editor', displayName: 'Editor User', email: 'editor@test.com' });
    mockBoardAccessService.getUserRoleOnBoard.mockResolvedValueOnce('EDITOR');

    await gateway.handleAuthAuthenticate({ token: 'valid-token' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-1', clientId: 'client-editor' }, socket);

    const testStroke: Stroke = {
      id: 'stroke-2',
      points: [{ x: 2, y: 2 }],
      color: '#000',
      width: 2,
      tool: 'pen',
    };

    await gateway.handleStrokeAdd({ roomId: 'room-1', stroke: testStroke, clientId: 'client-editor' }, socket);
    expect(mockBoardPersistenceService.saveStrokeTx).toHaveBeenCalledWith('room-1', testStroke, expect.any(String), 'user-editor', 'Editor User', 'client-editor');

    await gateway.handleBoardClear({ roomId: 'room-1', clientId: 'client-editor' }, socket);
    expect(mockBoardPersistenceService.clearBoardTx).not.toHaveBeenCalled();
  });

  it('Test 9: should allow OWNER to draw, erase, and clear board', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);

    mockAuthService.verifyJwt.mockReturnValueOnce({ sub: 'user-owner', email: 'owner@test.com' });
    mockAuthService.validateUserById.mockResolvedValueOnce({ id: 'user-owner', displayName: 'Owner User', email: 'owner@test.com' });
    mockBoardAccessService.getUserRoleOnBoard.mockResolvedValueOnce('OWNER');

    await gateway.handleAuthAuthenticate({ token: 'valid-token' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-1', clientId: 'client-owner' }, socket);

    await gateway.handleBoardClear({ roomId: 'room-1', clientId: 'client-owner' }, socket);
    expect(mockBoardPersistenceService.clearBoardTx).toHaveBeenCalledWith('room-1', expect.any(String), 'user-owner', 'Owner User', 'client-owner');
  });

  it('Test 10: should support reconnection flow (connect -> authenticate -> join room)', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);

    mockAuthService.verifyJwt.mockReturnValueOnce({ sub: 'user-1', email: 'user@test.com' });
    mockAuthService.validateUserById.mockResolvedValueOnce({ id: 'user-1', displayName: 'Alice Verified', email: 'user@test.com' });
    mockBoardAccessService.getUserRoleOnBoard.mockResolvedValueOnce('OWNER');

    await gateway.handleAuthAuthenticate({ token: 'valid-token' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-reconnect', clientId: 'client-1' }, socket);

    gateway.handleDisconnect(socket);

    // Reconnect socket instance
    const socket2 = createMockSocket();
    gateway.handleConnection(socket2);

    mockAuthService.verifyJwt.mockReturnValueOnce({ sub: 'user-1', email: 'user@test.com' });
    mockAuthService.validateUserById.mockResolvedValueOnce({ id: 'user-1', displayName: 'Alice Verified', email: 'user@test.com' });
    mockBoardAccessService.getUserRoleOnBoard.mockResolvedValueOnce('OWNER');

    await gateway.handleAuthAuthenticate({ token: 'valid-token' }, socket2);
    await gateway.handleRoomJoin({ roomId: 'room-reconnect', clientId: 'client-1' }, socket2);

    expect(socket2.send).toHaveBeenCalledWith(
      expect.stringContaining('"userRole":"OWNER"')
    );
  });
});
