import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BoardRole, BoardSummary, BoardMemberDto } from '@whiteboard/shared';
import { Role } from '@prisma/client';

@Injectable()
export class BoardAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Determine the role of a user on a given room/board.
   * Returns null if access is denied (IDOR protection).
   */
  async getUserRoleOnBoard(userId: string | null, roomId: string): Promise<BoardRole | null> {
    if (this.prisma.getStatus() !== 'connected') {
      return 'EDITOR'; // Default fallback if db offline
    }

    try {
      const board = await this.prisma.board.findUnique({
        where: { roomId },
        include: { members: true },
      });

      if (!board) {
        // Room not yet saved in database defaults to EDITOR for active user
        return 'EDITOR';
      }

      // Anonymous / Unowned legacy board -> default to EDITOR
      if (!board.ownerId) {
        return 'EDITOR';
      }

      // Primary Owner invariant check
      if (userId && board.ownerId === userId) {
        return 'OWNER';
      }

      // Member lookup
      if (userId) {
        const membership = board.members.find((m) => m.userId === userId);
        if (membership) {
          return membership.role as BoardRole;
        }
      }

      // Non-member on an owned private board -> Access Denied (IDOR Protection)
      return null;
    } catch (err) {
      console.error(`[BoardAccessService] Error in getUserRoleOnBoard for room ${roomId}`, err);
      return null;
    }
  }

  /**
   * Get all boards owned by or shared with a user.
   */
  async getAccessibleBoards(userId: string): Promise<BoardSummary[]> {
    const ownedBoards = await this.prisma.board.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
    });

    const memberships = await this.prisma.boardMember.findMany({
      where: { userId },
      include: { board: true },
      orderBy: { updatedAt: 'desc' },
    });

    const resultMap = new Map<string, BoardSummary>();

    for (const b of ownedBoards) {
      resultMap.set(b.id, {
        id: b.id,
        roomId: b.roomId,
        name: b.name || 'Untitled Whiteboard',
        ownerId: b.ownerId,
        role: 'OWNER',
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      });
    }

    for (const m of memberships) {
      if (!resultMap.has(m.board.id)) {
        resultMap.set(m.board.id, {
          id: m.board.id,
          roomId: m.board.roomId,
          name: m.board.name || 'Untitled Whiteboard',
          ownerId: m.board.ownerId,
          role: m.role as BoardRole,
          createdAt: m.board.createdAt.toISOString(),
          updatedAt: m.board.updatedAt.toISOString(),
        });
      }
    }

    return Array.from(resultMap.values());
  }

  /**
   * Create a new board owned by the user.
   */
  async createBoard(userId: string, roomId?: string, name?: string): Promise<BoardSummary> {
    const finalRoomId = roomId || `room-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const finalName = name?.trim() || 'Untitled Whiteboard';

    const existing = await this.prisma.board.findUnique({
      where: { roomId: finalRoomId },
    });

    if (existing) {
      if (existing.ownerId && existing.ownerId !== userId) {
        throw new ForbiddenException('Room ID is already taken by another user');
      }

      // Claim ownership if unowned or owned by same user
      const updated = await this.prisma.board.update({
        where: { id: existing.id },
        data: {
          ownerId: userId,
          name: finalName,
        },
      });

      await this.prisma.boardMember.upsert({
        where: { boardId_userId: { boardId: updated.id, userId } },
        create: { boardId: updated.id, userId, role: Role.OWNER },
        update: { role: Role.OWNER },
      });

      return {
        id: updated.id,
        roomId: updated.roomId,
        name: updated.name,
        ownerId: updated.ownerId,
        role: 'OWNER',
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }

    const created = await this.prisma.board.create({
      data: {
        roomId: finalRoomId,
        name: finalName,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: Role.OWNER,
          },
        },
      },
    });

    return {
      id: created.id,
      roomId: created.roomId,
      name: created.name,
      ownerId: created.ownerId,
      role: 'OWNER',
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * Get all members of a board.
   */
  async getBoardMembers(userId: string, roomId: string): Promise<BoardMemberDto[]> {
    const userRole = await this.getUserRoleOnBoard(userId, roomId);
    if (!userRole) {
      throw new ForbiddenException('Access denied to this board');
    }

    const board = await this.prisma.board.findUnique({
      where: { roomId },
      include: {
        members: {
          include: { user: true },
        },
        owner: true,
      },
    });

    if (!board) {
      throw new NotFoundException('Board not found');
    }

    return board.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      displayName: m.user.displayName,
      role: m.role as BoardRole,
    }));
  }

  /**
   * Add or update a board member (OWNER only).
   */
  async addOrUpdateMember(
    userId: string,
    roomId: string,
    memberEmail: string,
    role: BoardRole,
  ): Promise<BoardMemberDto> {
    const userRole = await this.getUserRoleOnBoard(userId, roomId);
    if (userRole !== 'OWNER') {
      throw new ForbiddenException('Only the board owner can manage members');
    }

    const board = await this.prisma.board.findUnique({
      where: { roomId },
    });

    if (!board) {
      throw new NotFoundException('Board not found');
    }

    const normalizedEmail = memberEmail.toLowerCase().trim();
    const targetUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!targetUser) {
      throw new NotFoundException(`No user found with email "${memberEmail}"`);
    }

    const targetRole = role === 'OWNER' ? Role.OWNER : role === 'VIEWER' ? Role.VIEWER : Role.EDITOR;

    if (board.ownerId === targetUser.id && targetRole !== Role.OWNER) {
      throw new BadRequestException('Cannot demote primary board owner');
    }

    const member = await this.prisma.boardMember.upsert({
      where: { boardId_userId: { boardId: board.id, userId: targetUser.id } },
      create: {
        boardId: board.id,
        userId: targetUser.id,
        role: targetRole,
      },
      update: {
        role: targetRole,
      },
      include: { user: true },
    });

    return {
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      displayName: member.user.displayName,
      role: member.role as BoardRole,
    };
  }

  /**
   * Remove a board member (OWNER only).
   */
  async removeMember(userId: string, roomId: string, targetUserId: string): Promise<void> {
    const userRole = await this.getUserRoleOnBoard(userId, roomId);
    if (userRole !== 'OWNER') {
      throw new ForbiddenException('Only the board owner can remove members');
    }

    const board = await this.prisma.board.findUnique({
      where: { roomId },
    });

    if (!board) {
      throw new NotFoundException('Board not found');
    }

    if (board.ownerId === targetUserId) {
      throw new BadRequestException('Cannot remove the primary board owner');
    }

    await this.prisma.boardMember
      .delete({
        where: { boardId_userId: { boardId: board.id, userId: targetUserId } },
      })
      .catch(() => {});
  }
}
