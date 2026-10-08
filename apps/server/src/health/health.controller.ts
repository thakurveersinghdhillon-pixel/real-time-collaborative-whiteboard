import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { HealthResponse } from '@whiteboard/shared';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../database/prisma.service';

export interface ExtendedHealthResponse extends HealthResponse {
  instanceId: string;
  redis: string;
  database: string;
  uptime?: number;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly redisService: RedisService,
    private readonly prismaService: PrismaService
  ) {}

  @Get()
  getHealth(): ExtendedHealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      instanceId: this.redisService.getInstanceId(),
      redis: this.redisService.getStatus(),
      database: this.prismaService.getStatus(),
      uptime: process.uptime(),
    };
  }

  @Get('live')
  getLiveness() {
    return {
      status: 'ok',
      instanceId: this.redisService.getInstanceId(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  getReadiness(@Res() res: Response) {
    const dbStatus = this.prismaService.getStatus();
    const redisStatus = this.redisService.getStatus();
    const instanceId = this.redisService.getInstanceId();

    if (dbStatus === 'connected') {
      return res.status(HttpStatus.OK).json({
        status: 'ready',
        instanceId,
        database: dbStatus,
        redis: redisStatus,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      status: 'not_ready',
      instanceId,
      database: dbStatus,
      redis: redisStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
}
