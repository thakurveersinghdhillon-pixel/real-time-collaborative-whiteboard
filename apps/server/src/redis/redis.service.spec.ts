import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { DistributedEvent } from '@whiteboard/shared';

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
    service.resetForTesting();
  });

  it('should generate a unique instance ID', () => {
    expect(service.getInstanceId()).toBeDefined();
    expect(service.getInstanceId()).toMatch(/^server-/);
  });

  it('should ignore remote events originating from the same instance ID (echo loop prevention)', () => {
    const handler = jest.fn();
    const channel = 'whiteboard:room:test-room';

    (service as any).subscriptions.set(channel, new Set([handler]));

    const echoEvent: DistributedEvent = {
      eventId: 'evt-111',
      eventType: 'stroke:add',
      roomId: 'test-room',
      originInstanceId: service.getInstanceId(), // Same instance ID
      timestamp: Date.now(),
      payload: {},
    };

    (service as any).handleIncomingRedisMessage(
      channel,
      JSON.stringify(echoEvent)
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it('should process valid remote events from another server instance', () => {
    const handler = jest.fn();
    const channel = 'whiteboard:room:test-room';

    (service as any).subscriptions.set(channel, new Set([handler]));

    const remoteEvent: DistributedEvent = {
      eventId: 'evt-222',
      eventType: 'stroke:add',
      roomId: 'test-room',
      originInstanceId: 'server-other-99', // Different instance ID
      timestamp: Date.now(),
      payload: { roomId: 'test-room', clientId: 'remote-client' },
    };

    (service as any).handleIncomingRedisMessage(
      channel,
      JSON.stringify(remoteEvent)
    );

    expect(handler).toHaveBeenCalledWith(remoteEvent);
  });

  it('should deduplicate processing if the same event ID is received twice', () => {
    const handler = jest.fn();
    const channel = 'whiteboard:room:test-room';

    (service as any).subscriptions.set(channel, new Set([handler]));

    const remoteEvent: DistributedEvent = {
      eventId: 'evt-duplicate-1',
      eventType: 'board:clear',
      roomId: 'test-room',
      originInstanceId: 'server-other-99',
      timestamp: Date.now(),
      payload: { roomId: 'test-room', clientId: 'remote-client' },
    };

    // First delivery
    (service as any).handleIncomingRedisMessage(
      channel,
      JSON.stringify(remoteEvent)
    );
    // Duplicate delivery
    (service as any).handleIncomingRedisMessage(
      channel,
      JSON.stringify(remoteEvent)
    );

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
