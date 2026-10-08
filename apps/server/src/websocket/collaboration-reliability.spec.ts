import { Test, TestingModule } from '@nestjs/testing';
import { WhiteboardGateway } from './websocket.gateway';
import { RedisService } from '../redis/redis.service';
import { BoardPersistenceService } from '../boards/board-persistence.service';
import { AuthService } from '../auth/auth.service';
import { BoardAccessService } from '../boards/board-access.service';
import { Stroke, DistributedEvent } from '@whiteboard/shared';

describe('Phase 7 Collaboration Reliability & Synchronization Test Suite', () => {
  let gateway: WhiteboardGateway;

  const mockRedisService = {
    getInstanceId: jest.fn().mockReturnValue('server-test-1'),
    getStatus: jest.fn().mockReturnValue('connected'),
    publishEvent: jest.fn().mockResolvedValue('evt-test-1'),
    subscribeToRoom: jest.fn().mockImplementation((roomId, handler) => {
      mockRedisService._handler = handler;
      return Promise.resolve();
    }),
    unsubscribeFromRoom: jest.fn().mockResolvedValue(undefined),
    _handler: null as any,
  };

  const mockBoardPersistenceService = {
    loadBoardState: jest.fn().mockResolvedValue({ strokes: [], version: 0 }),
    saveStrokeTx: jest.fn(),
    deleteStrokeTx: jest.fn(),
    clearBoardTx: jest.fn(),
  };

  const mockAuthService = {
    verifyJwt: jest.fn().mockReturnValue({ sub: 'user-1', email: 'alice@test.com' }),
    validateUserById: jest.fn().mockResolvedValue({ id: 'user-1', displayName: 'Alice', email: 'alice@test.com' }),
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
    mockBoardPersistenceService.saveStrokeTx = jest.fn();
    mockBoardPersistenceService.deleteStrokeTx = jest.fn();
    mockBoardPersistenceService.clearBoardTx = jest.fn();
    mockBoardPersistenceService.loadBoardState = jest.fn().mockResolvedValue({ strokes: [], version: 0 });

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

  it('1. Version increment: stroke:add transactionally increments board version and broadcasts version', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);
    await gateway.handleAuthAuthenticate({ token: 'jwt' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-version', clientId: 'c1' }, socket);

    const stroke: Stroke = {
      id: 'stroke-v1',
      points: [{ x: 1, y: 1 }],
      color: '#000',
      width: 2,
      tool: 'pen',
    };

    mockBoardPersistenceService.saveStrokeTx.mockResolvedValueOnce({
      version: 1,
      isDuplicate: false,
    });

    await gateway.handleStrokeAdd(
      { roomId: 'room-version', stroke, clientId: 'c1', eventId: 'evt-v1' },
      socket
    );

    expect(mockBoardPersistenceService.saveStrokeTx).toHaveBeenCalledWith(
      'room-version',
      stroke,
      'evt-v1',
      'user-1',
      'Alice',
      'c1'
    );
    expect(gateway.getRoomManager().getVersion('room-version')).toBe(1);
    expect(mockRedisService.publishEvent).toHaveBeenCalledWith(
      'room-version',
      'stroke:add',
      expect.objectContaining({ version: 1, eventId: 'evt-v1' }),
      1
    );
  });

  it('2. Idempotency: Duplicate mutation with same eventId is ignored', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);
    await gateway.handleAuthAuthenticate({ token: 'jwt' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-idem', clientId: 'c1' }, socket);

    mockRedisService.publishEvent.mockClear();

    const stroke: Stroke = {
      id: 'stroke-dup',
      points: [{ x: 2, y: 2 }],
      color: '#000',
      width: 2,
      tool: 'pen',
    };

    mockBoardPersistenceService.saveStrokeTx.mockResolvedValueOnce({
      version: 5,
      isDuplicate: true,
    });

    await gateway.handleStrokeAdd(
      { roomId: 'room-idem', stroke, clientId: 'c1', eventId: 'evt-dup' },
      socket
    );

    expect(mockRedisService.publishEvent).not.toHaveBeenCalled();
  });

  it('3. Concurrent Duplicate Delivery: Concurrent requests with same eventId process exactly one mutation', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);
    await gateway.handleAuthAuthenticate({ token: 'jwt' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-concurrent-dup', clientId: 'c1' }, socket);

    mockRedisService.publishEvent.mockClear();

    const stroke: Stroke = {
      id: 'stroke-cdup',
      points: [{ x: 2, y: 2 }],
      color: '#000',
      width: 2,
      tool: 'pen',
    };

    mockBoardPersistenceService.saveStrokeTx
      .mockResolvedValueOnce({ version: 10, isDuplicate: false })
      .mockResolvedValueOnce({ version: 10, isDuplicate: true });

    await Promise.all([
      gateway.handleStrokeAdd(
        { roomId: 'room-concurrent-dup', stroke, clientId: 'c1', eventId: 'evt-cdup' },
        socket
      ),
      gateway.handleStrokeAdd(
        { roomId: 'room-concurrent-dup', stroke, clientId: 'c1', eventId: 'evt-cdup' },
        socket
      ),
    ]);

    expect(mockRedisService.publishEvent).toHaveBeenCalledTimes(1);
    expect(gateway.getRoomManager().getStrokes('room-concurrent-dup')).toHaveLength(1);
  });

  it('4. Concurrent Mutations: Multiple users drawing concurrently receive unique monotonic versions', async () => {
    const socketA = createMockSocket();
    const socketB = createMockSocket();
    const socketC = createMockSocket();

    gateway.handleConnection(socketA);
    gateway.handleConnection(socketB);
    gateway.handleConnection(socketC);

    await gateway.handleAuthAuthenticate({ token: 'jwt' }, socketA);
    await gateway.handleAuthAuthenticate({ token: 'jwt' }, socketB);
    await gateway.handleAuthAuthenticate({ token: 'jwt' }, socketC);

    await gateway.handleRoomJoin({ roomId: 'room-concurrent', clientId: 'cA' }, socketA);
    await gateway.handleRoomJoin({ roomId: 'room-concurrent', clientId: 'cB' }, socketB);
    await gateway.handleRoomJoin({ roomId: 'room-concurrent', clientId: 'cC' }, socketC);

    mockBoardPersistenceService.saveStrokeTx
      .mockResolvedValueOnce({ version: 101, isDuplicate: false })
      .mockResolvedValueOnce({ version: 102, isDuplicate: false })
      .mockResolvedValueOnce({ version: 103, isDuplicate: false });

    const strokeA: Stroke = { id: 's-A', points: [], color: '#f00', width: 2, tool: 'pen' };
    const strokeB: Stroke = { id: 's-B', points: [], color: '#0f0', width: 2, tool: 'pen' };
    const strokeC: Stroke = { id: 's-C', points: [], color: '#00f', width: 2, tool: 'pen' };

    await Promise.all([
      gateway.handleStrokeAdd({ roomId: 'room-concurrent', stroke: strokeA, clientId: 'cA', eventId: 'eA' }, socketA),
      gateway.handleStrokeAdd({ roomId: 'room-concurrent', stroke: strokeB, clientId: 'cB', eventId: 'eB' }, socketB),
      gateway.handleStrokeAdd({ roomId: 'room-concurrent', stroke: strokeC, clientId: 'cC', eventId: 'eC' }, socketC),
    ]);

    expect(gateway.getRoomManager().getVersion('room-concurrent')).toBe(103);
    expect(gateway.getRoomManager().getStrokes('room-concurrent')).toHaveLength(3);
  });

  it('5. Out-of-Order & Duplicate Remote Events: Gap triggers DB sync; subsequent stale event is ignored', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);
    await gateway.handleAuthAuthenticate({ token: 'jwt' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-order', clientId: 'c1' }, socket);

    gateway.getRoomManager().setStrokes('room-order', [], 10);

    mockBoardPersistenceService.loadBoardState.mockResolvedValueOnce({
      strokes: [
        { id: 's-11', points: [], color: '#000', width: 2, tool: 'pen' },
        { id: 's-12', points: [], color: '#000', width: 2, tool: 'pen' },
      ],
      version: 12,
    });

    // 1. Receive version 12 (gap! expected 11)
    const remoteEvent12: DistributedEvent = {
      eventId: 'evt-12',
      eventType: 'stroke:add',
      roomId: 'room-order',
      originInstanceId: 'server-2',
      timestamp: Date.now(),
      version: 12,
      payload: {
        roomId: 'room-order',
        clientId: 'c2',
        stroke: { id: 's-12', points: [], color: '#000', width: 2, tool: 'pen' },
      },
    };

    await (gateway as any).handleRemoteRedisEvent(remoteEvent12);
    expect(gateway.getRoomManager().getVersion('room-order')).toBe(12);

    // 2. Now receive version 11 (stale! version 11 <= local 12)
    const remoteEvent11: DistributedEvent = {
      eventId: 'evt-11',
      eventType: 'stroke:add',
      roomId: 'room-order',
      originInstanceId: 'server-2',
      timestamp: Date.now(),
      version: 11,
      payload: {
        roomId: 'room-order',
        clientId: 'c2',
        stroke: { id: 's-11', points: [], color: '#000', width: 2, tool: 'pen' },
      },
    };

    const initialStrokesCount = gateway.getRoomManager().getStrokes('room-order').length;
    await (gateway as any).handleRemoteRedisEvent(remoteEvent11);
    expect(gateway.getRoomManager().getStrokes('room-order').length).toBe(initialStrokesCount);

    // 3. Receive duplicate version 12 again
    await (gateway as any).handleRemoteRedisEvent(remoteEvent12);
    expect(gateway.getRoomManager().getStrokes('room-order').length).toBe(initialStrokesCount);
  });

  it('6. Reconnect Synchronization: Client joining with stale knownVersion receives current authoritative snapshot', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);
    await gateway.handleAuthAuthenticate({ token: 'jwt' }, socket);

    mockBoardPersistenceService.loadBoardState.mockResolvedValueOnce({
      strokes: [
        { id: 's-1', points: [], color: '#000', width: 2, tool: 'pen' },
        { id: 's-2', points: [], color: '#000', width: 2, tool: 'pen' },
      ],
      version: 15,
    });

    await gateway.handleRoomJoin(
      { roomId: 'room-reconnect-sync', clientId: 'c-reconnect', knownVersion: 10 },
      socket
    );

    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('"version":15')
    );
  });

  it('7. PostgreSQL Failure: Database mutation failure sends MUTATION_FAILED error and cancels broadcast', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);
    await gateway.handleAuthAuthenticate({ token: 'jwt' }, socket);
    await gateway.handleRoomJoin({ roomId: 'room-fail', clientId: 'c1' }, socket);

    mockRedisService.publishEvent.mockClear();
    mockBoardPersistenceService.saveStrokeTx.mockResolvedValueOnce(null); // DB failure

    const stroke: Stroke = {
      id: 'stroke-fail',
      points: [{ x: 3, y: 3 }],
      color: '#000',
      width: 2,
      tool: 'pen',
    };

    await gateway.handleStrokeAdd(
      { roomId: 'room-fail', stroke, clientId: 'c1', eventId: 'evt-fail' },
      socket
    );

    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('MUTATION_FAILED')
    );
    expect(mockRedisService.publishEvent).not.toHaveBeenCalled();
  });

  it('8. Server Restart Recovery: Room hydrates authoritative state and version from PostgreSQL on join', async () => {
    const socket = createMockSocket();
    gateway.handleConnection(socket);
    await gateway.handleAuthAuthenticate({ token: 'jwt' }, socket);

    const savedStrokes: Stroke[] = [
      { id: 's-persisted-1', points: [], color: '#f00', width: 4, tool: 'pen' },
    ];

    mockBoardPersistenceService.loadBoardState.mockResolvedValueOnce({
      strokes: savedStrokes,
      version: 42,
    });

    await gateway.handleRoomJoin({ roomId: 'room-restart', clientId: 'c1' }, socket);

    expect(gateway.getRoomManager().getVersion('room-restart')).toBe(42);
    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('"version":42')
    );
  });
});
