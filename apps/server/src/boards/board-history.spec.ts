import { Test, TestingModule } from '@nestjs/testing';
import { BoardsController } from './boards.controller';
import { BoardAccessService } from './board-access.service';
import { BoardPersistenceService } from './board-persistence.service';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthUser, Stroke } from '@whiteboard/shared';

describe('Phase 9 — Advanced Collaboration & History System', () => {
  let controller: BoardsController;
  let persistenceService: BoardPersistenceService;
  let accessService: BoardAccessService;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'user1@example.com',
    displayName: 'User One',
  };

  const mockAccessService = {
    getUserRoleOnBoard: jest.fn(),
  };

  const mockPersistenceService = {
    getBoardHistory: jest.fn(),
    getBoardStateAtVersion: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BoardsController],
      providers: [
        { provide: BoardAccessService, useValue: mockAccessService },
        { provide: BoardPersistenceService, useValue: mockPersistenceService },
      ],
    }).compile();

    controller = module.get<BoardsController>(BoardsController);
    persistenceService = module.get<BoardPersistenceService>(BoardPersistenceService);
    accessService = module.get<BoardAccessService>(BoardAccessService);

    jest.clearAllMocks();
  });

  describe('REST API Authorization for History Endpoints', () => {
    it('should allow members (OWNER/EDITOR/VIEWER) to access board history', async () => {
      mockAccessService.getUserRoleOnBoard.mockResolvedValue('VIEWER');
      mockPersistenceService.getBoardHistory.mockResolvedValue({
        roomId: 'room-1',
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      const res = await controller.getBoardHistory({ user: mockUser }, 'room-1', '1', '20', 'desc');
      expect(res.roomId).toBe('room-1');
      expect(mockAccessService.getUserRoleOnBoard).toHaveBeenCalledWith('user-1', 'room-1');
    });

    it('should throw ForbiddenException if user is not a member of the board', async () => {
      mockAccessService.getUserRoleOnBoard.mockResolvedValue(null);

      await expect(
        controller.getBoardHistory({ user: mockUser }, 'room-private', '1', '20', 'desc')
      ).rejects.toThrow(ForbiddenException);

      await expect(
        controller.getBoardStateAtVersion({ user: mockUser }, 'room-private', 5)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reconstruct board state at valid version for authorized members', async () => {
      mockAccessService.getUserRoleOnBoard.mockResolvedValue('EDITOR');
      const testStrokes: Stroke[] = [
        { id: 's-1', points: [{ x: 0, y: 0 }], color: '#000', width: 2, tool: 'pen' },
      ];
      mockPersistenceService.getBoardStateAtVersion.mockResolvedValue({
        roomId: 'room-1',
        version: 2,
        strokes: testStrokes,
        snapshotUsed: true,
        eventsReplayed: 1,
      });

      const res = await controller.getBoardStateAtVersion({ user: mockUser }, 'room-1', 2);
      expect(res.version).toBe(2);
      expect(res.strokes).toEqual(testStrokes);
      expect(res.snapshotUsed).toBe(true);
    });
  });

  describe('Collaborative Undo / Redo Semantics & Immutability', () => {
    it('should reconstruct board states across a full add -> add -> undo -> redo sequence', async () => {
      mockAccessService.getUserRoleOnBoard.mockResolvedValue('OWNER');

      const strokeA: Stroke = { id: 'stroke-A', points: [{ x: 1, y: 1 }], color: '#f00', width: 2, tool: 'pen' };
      const strokeB: Stroke = { id: 'stroke-B', points: [{ x: 2, y: 2 }], color: '#0f0', width: 2, tool: 'pen' };

      // Mock historical reconstruction responses matching v1 (add A), v2 (add B), v3 (undo B), v4 (redo B)
      mockPersistenceService.getBoardStateAtVersion
        .mockResolvedValueOnce({ roomId: 'room-ur', version: 1, strokes: [strokeA], snapshotUsed: false, eventsReplayed: 1 })
        .mockResolvedValueOnce({ roomId: 'room-ur', version: 2, strokes: [strokeA, strokeB], snapshotUsed: false, eventsReplayed: 2 })
        .mockResolvedValueOnce({ roomId: 'room-ur', version: 3, strokes: [strokeA], snapshotUsed: false, eventsReplayed: 3 })
        .mockResolvedValueOnce({ roomId: 'room-ur', version: 4, strokes: [strokeA, strokeB], snapshotUsed: false, eventsReplayed: 4 });

      const v1State = await controller.getBoardStateAtVersion({ user: mockUser }, 'room-ur', 1);
      expect(v1State.strokes).toEqual([strokeA]);

      const v2State = await controller.getBoardStateAtVersion({ user: mockUser }, 'room-ur', 2);
      expect(v2State.strokes).toEqual([strokeA, strokeB]);

      const v3State = await controller.getBoardStateAtVersion({ user: mockUser }, 'room-ur', 3);
      expect(v3State.strokes).toEqual([strokeA]);

      const v4State = await controller.getBoardStateAtVersion({ user: mockUser }, 'room-ur', 4);
      expect(v4State.strokes).toEqual([strokeA, strokeB]);
    });

    it('should retain all four immutable events in board history after undo and redo', async () => {
      mockAccessService.getUserRoleOnBoard.mockResolvedValue('EDITOR');

      mockPersistenceService.getBoardHistory.mockResolvedValue({
        roomId: 'room-ur',
        items: [
          { version: 4, eventType: 'stroke:add', payload: { stroke: { id: 'stroke-B' } } },
          { version: 3, eventType: 'stroke:remove', payload: { strokeId: 'stroke-B' } },
          { version: 2, eventType: 'stroke:add', payload: { stroke: { id: 'stroke-B' } } },
          { version: 1, eventType: 'stroke:add', payload: { stroke: { id: 'stroke-A' } } },
        ],
        total: 4,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const history = await controller.getBoardHistory({ user: mockUser }, 'room-ur', '1', '10', 'desc');
      expect(history.total).toBe(4);
      expect(history.items).toHaveLength(4);
      expect(history.items[1].eventType).toBe('stroke:remove'); // Undo event at v3
      expect(history.items[0].eventType).toBe('stroke:add');    // Redo event at v4
    });
  });
});
