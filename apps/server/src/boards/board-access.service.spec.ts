import { Test, TestingModule } from '@nestjs/testing';
import { BoardAccessService } from './board-access.service';
import { PrismaService } from '../database/prisma.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('BoardAccessService (Phase 6 Authorization & Access Audit)', () => {
  let service: BoardAccessService;

  const mockPrismaService = {
    getStatus: jest.fn().mockReturnValue('connected'),
    board: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    boardMember: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardAccessService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<BoardAccessService>(BoardAccessService);
    jest.clearAllMocks();
  });

  it('should return OWNER for primary board owner', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({
      id: 'board-1',
      roomId: 'room-1',
      ownerId: 'user-owner',
      members: [],
    });

    const role = await service.getUserRoleOnBoard('user-owner', 'room-1');
    expect(role).toBe('OWNER');
  });

  it('should return null for non-member attempting IDOR access on owned board', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({
      id: 'board-1',
      roomId: 'room-1',
      ownerId: 'user-owner',
      members: [],
    });

    const role = await service.getUserRoleOnBoard('user-unauthorized', 'room-1');
    expect(role).toBeNull();
  });

  it('should return EDITOR for unowned/legacy Phase 5 board', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({
      id: 'board-1',
      roomId: 'room-1',
      ownerId: null,
      members: [],
    });

    const role = await service.getUserRoleOnBoard(null, 'room-1');
    expect(role).toBe('EDITOR');
  });

  it('should return member role if user is listed in board members', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({
      id: 'board-1',
      roomId: 'room-1',
      ownerId: 'user-owner',
      members: [
        { userId: 'user-editor', role: 'EDITOR' },
        { userId: 'user-viewer', role: 'VIEWER' },
      ],
    });

    const roleEditor = await service.getUserRoleOnBoard('user-editor', 'room-1');
    expect(roleEditor).toBe('EDITOR');

    const roleViewer = await service.getUserRoleOnBoard('user-viewer', 'room-1');
    expect(roleViewer).toBe('VIEWER');
  });

  it('should prevent non-owner from managing board members', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({
      id: 'board-1',
      roomId: 'room-1',
      ownerId: 'user-owner',
      members: [{ userId: 'user-editor', role: 'EDITOR' }],
    });

    await expect(
      service.addOrUpdateMember('user-editor', 'room-1', 'new@test.com', 'EDITOR')
    ).rejects.toThrow(ForbiddenException);
  });

  it('should prevent demoting primary board owner', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({
      id: 'board-1',
      roomId: 'room-1',
      ownerId: 'user-owner',
      members: [],
    });

    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'user-owner',
      email: 'owner@test.com',
      displayName: 'Owner',
    });

    await expect(
      service.addOrUpdateMember('user-owner', 'room-1', 'owner@test.com', 'VIEWER')
    ).rejects.toThrow(BadRequestException);
  });

  it('should prevent removing primary board owner', async () => {
    mockPrismaService.board.findUnique.mockResolvedValue({
      id: 'board-1',
      roomId: 'room-1',
      ownerId: 'user-owner',
      members: [],
    });

    await expect(
      service.removeMember('user-owner', 'room-1', 'user-owner')
    ).rejects.toThrow(BadRequestException);
  });
});
