import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Request, ForbiddenException, ParseIntPipe } from '@nestjs/common';
import { BoardAccessService } from './board-access.service';
import { BoardPersistenceService } from './board-persistence.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, BoardSummary, BoardMemberDto, BoardRole, BoardHistoryPaginatedResponse, ReconstructedBoardState } from '@whiteboard/shared';

export class CreateBoardDto {
  roomId?: string;
  name?: string;
}

export class AddMemberDto {
  email!: string;
  role!: BoardRole;
}

@Controller('boards')
export class BoardsController {
  constructor(
    private readonly boardAccessService: BoardAccessService,
    private readonly boardPersistenceService: BoardPersistenceService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createBoard(
    @Request() req: { user: AuthUser },
    @Body() dto: CreateBoardDto,
  ): Promise<BoardSummary> {
    return this.boardAccessService.createBoard(req.user.id, dto.roomId, dto.name);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getMyBoards(@Request() req: { user: AuthUser }): Promise<BoardSummary[]> {
    return this.boardAccessService.getAccessibleBoards(req.user.id);
  }

  @Get(':roomId')
  async getBoardInfo(
    @Param('roomId') roomId: string,
    @Request() req: { user?: AuthUser },
  ): Promise<{ roomId: string; role: BoardRole }> {
    const userId = req.user?.id || null;
    const role = await this.boardAccessService.getUserRoleOnBoard(userId, roomId);
    if (!role) {
      throw new ForbiddenException('Access denied to this board');
    }
    return { roomId, role };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':roomId/members')
  async getMembers(
    @Request() req: { user: AuthUser },
    @Param('roomId') roomId: string,
  ): Promise<BoardMemberDto[]> {
    return this.boardAccessService.getBoardMembers(req.user.id, roomId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':roomId/members')
  async addMember(
    @Request() req: { user: AuthUser },
    @Param('roomId') roomId: string,
    @Body() dto: AddMemberDto,
  ): Promise<BoardMemberDto> {
    return this.boardAccessService.addOrUpdateMember(req.user.id, roomId, dto.email, dto.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':roomId/members/:targetUserId')
  async removeMember(
    @Request() req: { user: AuthUser },
    @Param('roomId') roomId: string,
    @Param('targetUserId') targetUserId: string,
  ): Promise<{ success: boolean }> {
    await this.boardAccessService.removeMember(req.user.id, roomId, targetUserId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':roomId/history')
  async getBoardHistory(
    @Request() req: { user: AuthUser },
    @Param('roomId') roomId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('order') order?: 'asc' | 'desc',
  ): Promise<BoardHistoryPaginatedResponse> {
    const role = await this.boardAccessService.getUserRoleOnBoard(req.user.id, roomId);
    if (!role) {
      throw new ForbiddenException('Access denied to board history');
    }
    const pageNum = page ? parseInt(page, 10) || 1 : 1;
    const limitNum = limit ? parseInt(limit, 10) || 20 : 20;
    const orderDir = order === 'asc' ? 'asc' : 'desc';

    return this.boardPersistenceService.getBoardHistory(roomId, pageNum, limitNum, orderDir);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':roomId/history/:version')
  async getBoardStateAtVersion(
    @Request() req: { user: AuthUser },
    @Param('roomId') roomId: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<ReconstructedBoardState> {
    const role = await this.boardAccessService.getUserRoleOnBoard(req.user.id, roomId);
    if (!role) {
      throw new ForbiddenException('Access denied to board history');
    }

    return this.boardPersistenceService.getBoardStateAtVersion(roomId, version);
  }
}
