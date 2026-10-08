import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import {
  WsEventType,
  DistributedEvent,
  isValidDistributedEvent,
} from '@whiteboard/shared';

export type RedisConnectionStatus = 'connected' | 'disconnected' | 'error';
export type DistributedEventHandler = (event: DistributedEvent) => void;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private instanceId: string;
  private status: RedisConnectionStatus = 'disconnected';

  private subscriptions: Map<string, Set<DistributedEventHandler>> = new Map();
  private processedEventIds: Set<string> = new Set();
  private maxCacheSize = 10000;

  constructor() {
    this.instanceId =
      process.env.INSTANCE_ID ||
      `server-${Math.random().toString(36).substring(2, 9)}`;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  getStatus(): RedisConnectionStatus {
    return this.status;
  }

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

    try {
      console.log(`[RedisService] Connecting instance ${this.instanceId} to Redis at ${redisUrl}`);

      this.pubClient = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          return Math.min(times * 1000, 5000);
        },
      });

      this.subClient = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          return Math.min(times * 1000, 5000);
        },
      });

      this.pubClient.on('connect', () => {
        console.log(`[RedisService] Publisher connected (${this.instanceId})`);
        this.status = 'connected';
      });

      this.pubClient.on('error', (err) => {
        console.error(`[RedisService] Publisher connection error (${this.instanceId}):`, err.message);
        this.status = 'error';
      });

      this.subClient.on('connect', () => {
        console.log(`[RedisService] Subscriber connected (${this.instanceId})`);
      });

      this.subClient.on('error', (err) => {
        console.error(`[RedisService] Subscriber connection error (${this.instanceId}):`, err.message);
      });

      this.subClient.on('message', (channel, messageString) => {
        this.handleIncomingRedisMessage(channel, messageString);
      });

      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      this.status = 'connected';
      console.log(`[RedisService] Successfully connected to Redis (${this.instanceId})`);
    } catch (err) {
      console.warn(
        `[RedisService] Could not establish Redis connection at ${redisUrl}. Operating in standalone mode.`,
        err instanceof Error ? err.message : err
      );
      this.status = 'disconnected';
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pubClient) {
      await this.pubClient.quit().catch(() => {});
      this.pubClient = null;
    }
    if (this.subClient) {
      await this.subClient.quit().catch(() => {});
      this.subClient = null;
    }
    this.status = 'disconnected';
  }

  /**
   * Publishes a room event to Redis Pub/Sub channel `whiteboard:room:<roomId>`.
   */
  async publishEvent<T>(
    roomId: string,
    eventType: WsEventType,
    payload: T,
    version?: number
  ): Promise<string | null> {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Cache eventId locally so origin instance skips double-processing
    this.markEventProcessed(eventId);

    const event: DistributedEvent<T> = {
      eventId,
      eventType,
      roomId,
      originInstanceId: this.instanceId,
      timestamp: Date.now(),
      version,
      payload,
    };


    if (this.status !== 'connected' || !this.pubClient) {
      return eventId; // Allow local processing if Redis is unavailable
    }

    const channel = `whiteboard:room:${roomId}`;
    try {
      await this.pubClient.publish(channel, JSON.stringify(event));
      return eventId;
    } catch (err) {
      console.error(`[RedisService] Failed to publish event to channel ${channel}`, err);
      return null;
    }
  }

  /**
   * Subscribes to a room's Redis Pub/Sub channel.
   */
  async subscribeToRoom(
    roomId: string,
    handler: DistributedEventHandler
  ): Promise<void> {
    const channel = `whiteboard:room:${roomId}`;
    let handlers = this.subscriptions.get(channel);

    if (!handlers) {
      handlers = new Set();
      this.subscriptions.set(channel, handlers);

      if (this.status === 'connected' && this.subClient) {
        await this.subClient.subscribe(channel).catch((err) => {
          console.error(`[RedisService] Failed to subscribe to channel ${channel}`, err);
        });
      }
    }

    handlers.add(handler);
  }

  /**
   * Unsubscribes a handler or entire channel.
   */
  async unsubscribeFromRoom(
    roomId: string,
    handler?: DistributedEventHandler
  ): Promise<void> {
    const channel = `whiteboard:room:${roomId}`;
    const handlers = this.subscriptions.get(channel);

    if (!handlers) return;

    if (handler) {
      handlers.delete(handler);
    }

    if (!handler || handlers.size === 0) {
      this.subscriptions.delete(channel);
      if (this.status === 'connected' && this.subClient) {
        await this.subClient.unsubscribe(channel).catch(() => {});
      }
    }
  }

  /**
   * Handles incoming Redis Pub/Sub messages from remote server instances.
   */
  private handleIncomingRedisMessage(channel: string, messageString: string): void {
    try {
      const parsed = JSON.parse(messageString);
      if (!isValidDistributedEvent(parsed)) {
        console.warn(`[RedisService] Rejecting malformed Redis message on channel ${channel}`);
        return;
      }

      const event = parsed as DistributedEvent;

      // Echo loop prevention: Ignore events originating from this server instance
      if (event.originInstanceId === this.instanceId) {
        return;
      }

      // Duplicate prevention: Ignore events already processed by this server
      if (this.processedEventIds.has(event.eventId)) {
        return;
      }

      this.markEventProcessed(event.eventId);

      const handlers = this.subscriptions.get(channel);
      if (handlers && handlers.size > 0) {
        handlers.forEach((handler) => handler(event));
      }
    } catch (err) {
      console.error(`[RedisService] Error parsing Redis message on channel ${channel}`, err);
    }
  }

  private markEventProcessed(eventId: string): void {
    if (this.processedEventIds.size >= this.maxCacheSize) {
      const firstKey = this.processedEventIds.values().next().value;
      if (firstKey) this.processedEventIds.delete(firstKey);
    }
    this.processedEventIds.add(eventId);
  }

  resetForTesting(): void {
    this.processedEventIds.clear();
    this.subscriptions.clear();
  }
}
