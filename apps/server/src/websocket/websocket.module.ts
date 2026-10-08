import { Module } from '@nestjs/common';
import { WhiteboardGateway } from './websocket.gateway';
import { RedisModule } from '../redis/redis.module';
import { BoardsModule } from '../boards/boards.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RedisModule, BoardsModule, AuthModule],
  providers: [WhiteboardGateway],
  exports: [WhiteboardGateway],
})
export class WebSocketModule {}
