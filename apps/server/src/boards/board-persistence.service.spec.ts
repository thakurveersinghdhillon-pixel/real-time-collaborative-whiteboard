import { Test, TestingModule } from '@nestjs/testing';
import { BoardPersistenceService } from './board-persistence.service';
import { PrismaService } from '../database/prisma.service';
import { Stroke } from '@whiteboard/shared';

describe('BoardPersistenceService', () => {
  let service: BoardPersistenceService;

  const mockPrismaService = {
    getStatus: jest.fn().mockReturnValue('connected'),
    board: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    strokeData: {
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    processedEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    boardEvent: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    boardSnapshot: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardPersistenceService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<BoardPersistenceService>(BoardPersistenceService);

    jest.clearAllMocks();

    mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
      return cb(mockPrismaService);
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get or create a board for a room', async () => {
    const mockBoard = { id: 'b-1', roomId: 'room-101', version: 0 };
    mockPrismaService.board.upsert.mockResolvedValue(mockBoard);

    const result = await service.getOrCreateBoard('room-101');
    expect(result).toEqual(mockBoard);
    expect(mockPrismaService.board.upsert).toHaveBeenCalledWith({
      where: { roomId: 'room-101' },
      create: { roomId: 'room-101', version: 0 },
      update: {},
    });
  });

  it('should load persisted board strokes and version ordered by creation', async () => {
    const testStroke: Stroke = {
      id: 'stroke-101',
      points: [{ x: 10, y: 10 }],
      color: '#000',
      width: 4,
      tool: 'pen',
    };

    mockPrismaService.board.findUnique.mockResolvedValue({
      id: 'b-1',
      roomId: 'room-101',
      version: 5,
      strokes: [{ data: testStroke }],
    });

    const snapshot = await service.loadBoardState('room-101');
    expect(snapshot.strokes).toHaveLength(1);
    expect(snapshot.strokes[0]).toEqual(testStroke);
    expect(snapshot.version).toBe(5);
  });

  it('should persist stroke data transactionally and increment board version', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({ id: 'b-1', roomId: 'room-101', version: 1 });
    mockPrismaService.processedEvent.findUnique.mockResolvedValue(null);
    mockPrismaService.board.update.mockResolvedValue({ id: 'b-1', roomId: 'room-101', version: 2 });
    mockPrismaService.strokeData.upsert.mockResolvedValue({});
    mockPrismaService.processedEvent.create.mockResolvedValue({});

    const testStroke: Stroke = {
      id: 'stroke-abc',
      points: [{ x: 5, y: 5 }],
      color: '#3b82f6',
      width: 2,
      tool: 'pen',
    };

    const res = await service.saveStrokeTx('room-101', testStroke, 'evt-1');

    expect(res).toEqual({ version: 2, isDuplicate: false });
    expect(mockPrismaService.board.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { version: { increment: 1 } },
    });
    expect(mockPrismaService.strokeData.upsert).toHaveBeenCalledWith({
      where: { strokeId: 'stroke-abc' },
      create: expect.objectContaining({
        boardId: 'b-1',
        strokeId: 'stroke-abc',
      }),
      update: expect.objectContaining({
        data: testStroke,
      }),
    });
  });

  it('should return isDuplicate true when eventId was already processed', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({ id: 'b-1', roomId: 'room-101', version: 10 });
    mockPrismaService.processedEvent.findUnique.mockResolvedValue({ id: 'p-1', eventId: 'evt-dup' });

    const testStroke: Stroke = {
      id: 'stroke-dup',
      points: [{ x: 5, y: 5 }],
      color: '#000',
      width: 2,
      tool: 'pen',
    };

    const res = await service.saveStrokeTx('room-101', testStroke, 'evt-dup');

    expect(res).toEqual({ version: 10, isDuplicate: true });
    expect(mockPrismaService.strokeData.upsert).not.toHaveBeenCalled();
  });

  it('should delete stroke data on stroke removal transactionally', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({ id: 'b-1', roomId: 'room-101', version: 2 });
    mockPrismaService.processedEvent.findUnique.mockResolvedValue(null);
    mockPrismaService.board.update.mockResolvedValue({ id: 'b-1', roomId: 'room-101', version: 3 });
    mockPrismaService.strokeData.deleteMany.mockResolvedValue({});

    const res = await service.deleteStrokeTx('room-101', 'stroke-del-1', 'evt-2');

    expect(res).toEqual({ version: 3, isDuplicate: false });
    expect(mockPrismaService.strokeData.deleteMany).toHaveBeenCalledWith({
      where: { boardId: 'b-1', strokeId: 'stroke-del-1' },
    });
  });

  it('should clear all strokes for a room transactionally', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({ id: 'b-1', roomId: 'room-101', version: 3 });
    mockPrismaService.processedEvent.findUnique.mockResolvedValue(null);
    mockPrismaService.board.update.mockResolvedValue({ id: 'b-1', roomId: 'room-101', version: 4 });
    mockPrismaService.strokeData.deleteMany.mockResolvedValue({ count: 5 });

    const res = await service.clearBoardTx('room-101', 'evt-3');

    expect(res).toEqual({ version: 4, isDuplicate: false });
    expect(mockPrismaService.strokeData.deleteMany).toHaveBeenCalledWith({
      where: { boardId: 'b-1' },
    });
  });

  it('should fetch paginated history items', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({ id: 'b-1', roomId: 'room-101' });
    mockPrismaService.boardEvent.count.mockResolvedValue(1);
    mockPrismaService.boardEvent.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        eventId: 'evt-1',
        boardId: 'b-1',
        roomId: 'room-101',
        version: 1,
        eventType: 'stroke:add',
        userId: 'u-1',
        userDisplayName: 'Tester',
        createdAt: new Date(),
        payload: { stroke: { id: 's-1' } },
      },
    ]);

    const history = await service.getBoardHistory('room-101', 1, 10);
    expect(history.total).toBe(1);
    expect(history.items).toHaveLength(1);
    expect(history.items[0].version).toBe(1);
  });

  it('should reconstruct board state at a specific version deterministically', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({ id: 'b-1', roomId: 'room-101', version: 3 });
    mockPrismaService.boardSnapshot.findFirst.mockResolvedValue(null);
    mockPrismaService.boardEvent.findMany.mockResolvedValue([
      {
        version: 1,
        eventType: 'stroke:add',
        payload: { stroke: { id: 's-1', points: [], color: '#000', width: 2, tool: 'pen' } },
      },
      {
        version: 2,
        eventType: 'stroke:add',
        payload: { stroke: { id: 's-2', points: [], color: '#ff0', width: 4, tool: 'pen' } },
      },
      {
        version: 3,
        eventType: 'stroke:remove',
        payload: { strokeId: 's-1' },
      },
    ]);

    const state = await service.getBoardStateAtVersion('room-101', 3);
    expect(state.version).toBe(3);
    expect(state.strokes).toHaveLength(1);
    expect(state.strokes[0].id).toBe('s-2');
  });
});
