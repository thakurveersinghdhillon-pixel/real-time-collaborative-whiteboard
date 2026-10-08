import { Module } from '@nestjs/common';
import { BoardPersistenceService } from './board-persistence.service';
import { BoardAccessService } from './board-access.service';
import { BoardsController } from './boards.controller';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BoardsController],
  providers: [BoardPersistenceService, BoardAccessService],
  exports: [BoardPersistenceService, BoardAccessService],
})
export class BoardsModule {}
