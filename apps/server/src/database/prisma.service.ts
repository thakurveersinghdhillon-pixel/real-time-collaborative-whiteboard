import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export type DatabaseConnectionStatus = 'connected' | 'disconnected' | 'error';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private status: DatabaseConnectionStatus = 'disconnected';

  constructor() {
    super({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            'postgresql://whiteboard:whiteboard@localhost:5432/whiteboard',
        },
      },
    });
  }

  getStatus(): DatabaseConnectionStatus {
    return this.status;
  }

  async onModuleInit(): Promise<void> {
    const dbUrl =
      process.env.DATABASE_URL ||
      'postgresql://whiteboard:whiteboard@localhost:5432/whiteboard';

    try {
      console.log(`[PrismaService] Connecting to PostgreSQL database...`);
      await this.$connect();
      this.status = 'connected';
      console.log(`[PrismaService] Successfully connected to PostgreSQL database`);
    } catch (err) {
      console.warn(
        `[PrismaService] Could not connect to PostgreSQL at ${dbUrl}. Operating in memory-only standalone mode.`,
        err instanceof Error ? err.message : err
      );
      this.status = 'disconnected';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect().catch(() => {});
    this.status = 'disconnected';
  }
}
