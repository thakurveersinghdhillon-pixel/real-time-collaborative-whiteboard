import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../database/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;

  const mockRedisService = {
    getInstanceId: jest.fn().mockReturnValue('server-test-1'),
    getStatus: jest.fn().mockReturnValue('connected'),
  };

  const mockPrismaService = {
    getStatus: jest.fn().mockReturnValue('connected'),
  };

  const mockResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: RedisService, useValue: mockRedisService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('should return status ok, instanceId, redis status, and database status', () => {
      const result = controller.getHealth();
      expect(result.status).toBe('ok');
      expect(result.version).toBe('1.0.0');
      expect(result.instanceId).toBe('server-test-1');
      expect(result.redis).toBe('connected');
      expect(result.database).toBe('connected');
    });
  });

  describe('getLiveness', () => {
    it('should return liveness status ok with instanceId and uptime', () => {
      const result = controller.getLiveness();
      expect(result.status).toBe('ok');
      expect(result.instanceId).toBe('server-test-1');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getReadiness', () => {
    it('should return 200 OK when database is connected', () => {
      mockPrismaService.getStatus.mockReturnValueOnce('connected');
      const res = mockResponse();

      controller.getReadiness(res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ready', database: 'connected' })
      );
    });

    it('should return 503 SERVICE_UNAVAILABLE when database is disconnected', () => {
      mockPrismaService.getStatus.mockReturnValueOnce('disconnected');
      const res = mockResponse();

      controller.getReadiness(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'not_ready', database: 'disconnected' })
      );
    });
  });
});
