import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { WebSocketModule } from './websocket/websocket.module';
import { RedisModule } from './redis/redis.module';
import { PrismaModule } from './database/prisma.module';
import { BoardsModule } from './boards/boards.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [HealthModule, PrismaModule, RedisModule, BoardsModule, AuthModule, WebSocketModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
