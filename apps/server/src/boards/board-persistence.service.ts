import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Stroke, BoardHistoryItem, ReconstructedBoardState, BoardHistoryPaginatedResponse } from '@whiteboard/shared';

export interface BoardSnapshotState {
  strokes: Stroke[];
  version: number;
}

export interface TxResult {
  version: number;
  isDuplicate: boolean;
}

export const SNAPSHOT_INTERVAL = 100; // Create snapshot every 100 versions

@Injectable()
export class BoardPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves or creates a persistent Board record for a room.
   */
  async getOrCreateBoard(roomId: string) {
    if (this.prisma.getStatus() !== 'connected') return null;

    try {
      return await this.prisma.board.upsert({
        where: { roomId },
        create: { roomId, version: 0 },
        update: {},
      });
    } catch (err) {
      console.warn(`[BoardPersistenceService] Failed getOrCreateBoard for room ${roomId}`, err);
      return null;
    }
  }

  /**
   * Loads all persisted strokes and the authoritative board version for a room from PostgreSQL.
   */
  async loadBoardState(roomId: string): Promise<BoardSnapshotState> {
    if (this.prisma.getStatus() !== 'connected') {
      return { strokes: [], version: 0 };
    }

    try {
      const board = await this.prisma.board.findUnique({
        where: { roomId },
        include: {
          strokes: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!board) {
        return { strokes: [], version: 0 };
      }

      const strokes = (board.strokes || []).map((record) => record.data as unknown as Stroke);
      console.log(`[BoardPersistenceService] BOARD_HYDRATED: Loaded room ${roomId} (strokes: ${strokes.length}, version: ${board.version})`);
      return { strokes, version: board.version };
    } catch (err) {
      console.warn(`[BoardPersistenceService] Failed loadBoardState for room ${roomId}`, err);
      return { strokes: [], version: 0 };
    }
  }

  /**
   * Transactionally saves a stroke, increments board version, records idempotency, and appends BoardEvent & BoardSnapshot.
   */
  async saveStrokeTx(
    roomId: string,
    stroke: Stroke,
    eventId?: string,
    userId?: string,
    userDisplayName?: string,
    clientId?: string
  ): Promise<TxResult | null> {
    if (this.prisma.getStatus() !== 'connected') return null;
    const finalEventId = eventId || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          let board = await tx.board.findUnique({ where: { roomId } });
          if (!board) {
            board = await tx.board.create({ data: { roomId, version: 0 } });
          }

          const existingEvent = await tx.processedEvent.findUnique({ where: { eventId: finalEventId } });
          if (existingEvent) {
            console.log(`[BoardPersistenceService] EVENT_DUPLICATE: event ${finalEventId} already processed for room ${roomId}`);
            return { version: board.version, isDuplicate: true };
          }

          const updatedBoard = await tx.board.update({
            where: { id: board.id },
            data: { version: { increment: 1 } },
          });

          await tx.strokeData.upsert({
            where: { strokeId: stroke.id },
            create: {
              boardId: board.id,
              strokeId: stroke.id,
              data: stroke as any,
            },
            update: {
              data: stroke as any,
            },
          });

          await tx.processedEvent.create({
            data: { eventId: finalEventId, roomId },
          });

          // Immutable BoardEvent for audit trail & historical reconstruction
          await tx.boardEvent.create({
            data: {
              eventId: finalEventId,
              boardId: board.id,
              roomId,
              version: updatedBoard.version,
              eventType: 'stroke:add',
              userId: userId || null,
              userDisplayName: userDisplayName || null,
              payload: { stroke, clientId } as any,
            },
          });

          // Automatic periodic BoardSnapshot
          if (updatedBoard.version % SNAPSHOT_INTERVAL === 0) {
            await this.createSnapshotInTx(tx, board.id, roomId, updatedBoard.version);
          }

          console.log(
            `[BoardPersistenceService] MUTATION_COMMITTED: stroke ${stroke.id} saved to room ${roomId}, version ${updatedBoard.version}`
          );
          return { version: updatedBoard.version, isDuplicate: false };
        },
        { isolationLevel: 'Serializable' as any }
      );
    } catch (err: any) {
      if (err?.code === 'P2002' || (typeof err?.message === 'string' && err.message.includes('Unique constraint'))) {
        console.log(`[BoardPersistenceService] EVENT_DUPLICATE (P2002 race caught): event ${finalEventId} already processed`);
        const board = await this.prisma.board.findUnique({ where: { roomId } }).catch(() => null);
        return { version: board?.version || 0, isDuplicate: true };
      }
      console.error(`[BoardPersistenceService] MUTATION_REJECTED: Error saving stroke ${stroke.id}`, err);
      return null;
    }
  }

  /**
   * Transactionally deletes a stroke, increments board version, records idempotency, and appends BoardEvent & BoardSnapshot.
   */
  async deleteStrokeTx(
    roomId: string,
    strokeId: string,
    eventId?: string,
    userId?: string,
    userDisplayName?: string,
    clientId?: string
  ): Promise<TxResult | null> {
    if (this.prisma.getStatus() !== 'connected') return null;
    const finalEventId = eventId || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          let board = await tx.board.findUnique({ where: { roomId } });
          if (!board) {
            board = await tx.board.create({ data: { roomId, version: 0 } });
          }

          const existingEvent = await tx.processedEvent.findUnique({ where: { eventId: finalEventId } });
          if (existingEvent) {
            console.log(`[BoardPersistenceService] EVENT_DUPLICATE: event ${finalEventId} already processed for room ${roomId}`);
            return { version: board.version, isDuplicate: true };
          }

          const updatedBoard = await tx.board.update({
            where: { id: board.id },
            data: { version: { increment: 1 } },
          });

          await tx.strokeData.deleteMany({
            where: { boardId: board.id, strokeId },
          });

          await tx.processedEvent.create({
            data: { eventId: finalEventId, roomId },
          });

          await tx.boardEvent.create({
            data: {
              eventId: finalEventId,
              boardId: board.id,
              roomId,
              version: updatedBoard.version,
              eventType: 'stroke:remove',
              userId: userId || null,
              userDisplayName: userDisplayName || null,
              payload: { strokeId, clientId } as any,
            },
          });

          if (updatedBoard.version % SNAPSHOT_INTERVAL === 0) {
            await this.createSnapshotInTx(tx, board.id, roomId, updatedBoard.version);
          }

          console.log(
            `[BoardPersistenceService] MUTATION_COMMITTED: stroke ${strokeId} deleted from room ${roomId}, version ${updatedBoard.version}`
          );
          return { version: updatedBoard.version, isDuplicate: false };
        },
        { isolationLevel: 'Serializable' as any }
      );
    } catch (err: any) {
      if (err?.code === 'P2002' || (typeof err?.message === 'string' && err.message.includes('Unique constraint'))) {
        console.log(`[BoardPersistenceService] EVENT_DUPLICATE (P2002 race caught): event ${finalEventId} already processed`);
        const board = await this.prisma.board.findUnique({ where: { roomId } }).catch(() => null);
        return { version: board?.version || 0, isDuplicate: true };
      }
      console.error(`[BoardPersistenceService] MUTATION_REJECTED: Error deleting stroke ${strokeId}`, err);
      return null;
    }
  }

  /**
   * Transactionally clears all strokes, increments board version, records idempotency, and appends BoardEvent & BoardSnapshot.
   */
  async clearBoardTx(
    roomId: string,
    eventId?: string,
    userId?: string,
    userDisplayName?: string,
    clientId?: string
  ): Promise<TxResult | null> {
    if (this.prisma.getStatus() !== 'connected') return null;
    const finalEventId = eventId || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          let board = await tx.board.findUnique({ where: { roomId } });
          if (!board) {
            board = await tx.board.create({ data: { roomId, version: 0 } });
          }

          const existingEvent = await tx.processedEvent.findUnique({ where: { eventId: finalEventId } });
          if (existingEvent) {
            console.log(`[BoardPersistenceService] EVENT_DUPLICATE: event ${finalEventId} already processed for room ${roomId}`);
            return { version: board.version, isDuplicate: true };
          }

          const updatedBoard = await tx.board.update({
            where: { id: board.id },
            data: { version: { increment: 1 } },
          });

          await tx.strokeData.deleteMany({
            where: { boardId: board.id },
          });

          await tx.processedEvent.create({
            data: { eventId: finalEventId, roomId },
          });

          await tx.boardEvent.create({
            data: {
              eventId: finalEventId,
              boardId: board.id,
              roomId,
              version: updatedBoard.version,
              eventType: 'board:clear',
              userId: userId || null,
              userDisplayName: userDisplayName || null,
              payload: { clientId } as any,
            },
          });

          if (updatedBoard.version % SNAPSHOT_INTERVAL === 0) {
            await this.createSnapshotInTx(tx, board.id, roomId, updatedBoard.version);
          }

          console.log(
            `[BoardPersistenceService] MUTATION_COMMITTED: cleared all strokes for room ${roomId}, version ${updatedBoard.version}`
          );
          return { version: updatedBoard.version, isDuplicate: false };
        },
        { isolationLevel: 'Serializable' as any }
      );
    } catch (err: any) {
      if (err?.code === 'P2002' || (typeof err?.message === 'string' && err.message.includes('Unique constraint'))) {
        console.log(`[BoardPersistenceService] EVENT_DUPLICATE (P2002 race caught): clear event ${finalEventId} already processed`);
        const board = await this.prisma.board.findUnique({ where: { roomId } }).catch(() => null);
        return { version: board?.version || 0, isDuplicate: true };
      }
      console.error(`[BoardPersistenceService] MUTATION_REJECTED: Error clearing board ${roomId}`, err);
      return null;
    }
  }

  /**
   * Helper to create a BoardSnapshot inside an active transaction.
   */
  private async createSnapshotInTx(tx: any, boardId: string, roomId: string, version: number): Promise<void> {
    const currentStrokes = await tx.strokeData.findMany({
      where: { boardId },
      orderBy: { createdAt: 'asc' },
    });
    const strokeList = currentStrokes.map((s: any) => s.data);

    await tx.boardSnapshot.upsert({
      where: { boardId_version: { boardId, version } },
      create: {
        boardId,
        roomId,
        version,
        state: strokeList as any,
      },
      update: {
        state: strokeList as any,
      },
    });
    console.log(`[BoardPersistenceService] SNAPSHOT_CREATED: Board ${boardId} snapshot created at version ${version}`);
  }

  /**
   * Manually forces a snapshot for testing/benchmarking.
   */
  async createSnapshot(roomId: string): Promise<boolean> {
    if (this.prisma.getStatus() !== 'connected') return false;

    const board = await this.prisma.board.findUnique({ where: { roomId } });
    if (!board) return false;

    const currentStrokes = await this.prisma.strokeData.findMany({
      where: { boardId: board.id },
      orderBy: { createdAt: 'asc' },
    });

    await this.prisma.boardSnapshot.upsert({
      where: { boardId_version: { boardId: board.id, version: board.version } },
      create: {
        boardId: board.id,
        roomId,
        version: board.version,
        state: currentStrokes.map((s) => s.data as any) as any,
      },
      update: {
        state: currentStrokes.map((s) => s.data as any) as any,
      },
    });
    return true;
  }

  /**
   * Reconstructs historical board state deterministically at a target version using snapshot + event replay.
   */
  async getBoardStateAtVersion(roomId: string, targetVersion: number): Promise<ReconstructedBoardState> {
    if (this.prisma.getStatus() !== 'connected') {
      return { roomId, version: 0, strokes: [], snapshotUsed: false, eventsReplayed: 0 };
    }

    const board = await this.prisma.board.findUnique({ where: { roomId } });
    if (!board) {
      throw new NotFoundException(`Board not found for room ${roomId}`);
    }

    if (targetVersion < 0 || targetVersion > board.version) {
      throw new BadRequestException(
        `Requested version ${targetVersion} is invalid. Current board version is ${board.version}`
      );
    }

    if (targetVersion === 0) {
      return {
        roomId,
        version: 0,
        strokes: [],
        snapshotUsed: false,
        eventsReplayed: 0,
      };
    }

    // 1. Find the newest snapshot <= targetVersion
    const snapshot = await this.prisma.boardSnapshot.findFirst({
      where: {
        boardId: board.id,
        version: { lte: targetVersion },
      },
      orderBy: { version: 'desc' },
    });

    let currentStrokes: Stroke[] = [];
    let startVersion = 0;
    let snapshotUsed = false;

    if (snapshot) {
      currentStrokes = (snapshot.state as unknown as Stroke[]) || [];
      startVersion = snapshot.version;
      snapshotUsed = true;
    }

    // 2. Fetch BoardEvents from startVersion + 1 to targetVersion
    const events = await this.prisma.boardEvent.findMany({
      where: {
        boardId: board.id,
        version: {
          gt: startVersion,
          lte: targetVersion,
        },
      },
      orderBy: { version: 'asc' },
    });

    // Stroke map for deterministic state replay
    const strokeMap = new Map<string, Stroke>();
    for (const s of currentStrokes) {
      if (s && s.id) strokeMap.set(s.id, s);
    }

    for (const evt of events) {
      const payload = evt.payload as any;
      if (evt.eventType === 'stroke:add' && payload?.stroke) {
        strokeMap.set(payload.stroke.id, payload.stroke);
      } else if (evt.eventType === 'stroke:remove' && payload?.strokeId) {
        strokeMap.delete(payload.strokeId);
      } else if (evt.eventType === 'board:clear') {
        strokeMap.clear();
      }
    }

    return {
      roomId,
      version: targetVersion,
      strokes: Array.from(strokeMap.values()),
      snapshotUsed,
      eventsReplayed: events.length,
    };
  }

  /**
   * Fetches paginated board history audit log for a room.
   */
  async getBoardHistory(
    roomId: string,
    page = 1,
    limit = 20,
    order: 'asc' | 'desc' = 'desc'
  ): Promise<BoardHistoryPaginatedResponse> {
    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));
    const skip = (pageNum - 1) * limitNum;

    if (this.prisma.getStatus() !== 'connected') {
      return { roomId, items: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const board = await this.prisma.board.findUnique({ where: { roomId } });
    if (!board) {
      return { roomId, items: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const [total, records] = await Promise.all([
      this.prisma.boardEvent.count({ where: { boardId: board.id } }),
      this.prisma.boardEvent.findMany({
        where: { boardId: board.id },
        orderBy: { version: order },
        skip,
        take: limitNum,
      }),
    ]);

    const items: BoardHistoryItem[] = records.map((rec) => ({
      id: rec.id,
      eventId: rec.eventId,
      boardId: rec.boardId,
      roomId: rec.roomId,
      version: rec.version,
      eventType: rec.eventType,
      userId: rec.userId,
      userDisplayName: rec.userDisplayName,
      timestamp: rec.createdAt.toISOString(),
      payload: rec.payload as Record<string, unknown>,
    }));

    return {
      roomId,
      items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 0,
    };
  }

  // Legacy helper wrappers
  async saveStroke(roomId: string, stroke: Stroke): Promise<void> {
    await this.saveStrokeTx(roomId, stroke);
  }

  async deleteStroke(roomId: string, strokeId: string): Promise<void> {
    await this.deleteStrokeTx(roomId, strokeId);
  }

  async clearBoard(roomId: string): Promise<void> {
    await this.clearBoardTx(roomId);
  }
}
