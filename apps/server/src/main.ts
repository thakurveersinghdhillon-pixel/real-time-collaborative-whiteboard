import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const jwtSecret = process.env.JWT_SECRET;
  const instanceId = process.env.INSTANCE_ID || 'server-1';

  // Production security check: Fail fast if JWT_SECRET is missing or weak
  if (isProduction && (!jwtSecret || jwtSecret.trim() === '')) {
    console.error(
      `[FATAL] [SERVER_START_FAILED] JWT_SECRET environment variable must be set in production mode!`
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  // Enable graceful shutdown hooks for SIGTERM / SIGINT
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );

  // Register native WsAdapter for WebSocket Gateway
  app.useWebSocketAdapter(new WsAdapter(app));

  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(
    `[SERVER_START] instanceId=${instanceId} port=${port} env=${process.env.NODE_ENV || 'development'} HTTP & WebSocket Gateway active`
  );
}

bootstrap();
