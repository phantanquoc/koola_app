import { NestFactory } from '@nestjs/core';
import { INestApplicationContext, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RedisService } from './common/redis/redis.service';
import { getAllowedOrigins } from './common/cors';
import { startDevEnvWatcher } from './dev-env-watcher';
import { minioClient, BUCKET, ensureBucketExists } from './media/minio-client';

class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly redisService: RedisService;

  constructor(app: INestApplicationContext, redisService: RedisService) {
    super(app);
    this.redisService = redisService;
  }

  async connectToRedis(): Promise<void> {
    // Reuse the single shared ioredis client owned by RedisService so the
    // process holds exactly ONE Redis connection — the Socket.IO adapter must
    // not open its own pool (task 4.3). RedisService connects in
    // onModuleInit, which runs during NestFactory.create() before this
    // adapter is wired, so pubClient is already 'ready' here. The adapter
    // never quits the shared client; lifecycle stays with RedisService.
    const pubClient = this.redisService.getClient();
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err: Error) =>
      console.error('[RedisIO] Pub client error:', err),
    );
    subClient.on('error', (err: Error) =>
      console.error('[RedisIO] Sub client error:', err),
    );

    // duplicate() inherits lazyConnect from the shared client's options —
    // connect explicitly before handing it to the adapter.
    if (subClient.status === 'wait') {
      await subClient.connect();
    }

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: any): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // WebSocket adapter with Redis — reuses the shared RedisService client
  // (single Redis pool per instance, task 4.3).
  const redisAdapter = new RedisIoAdapter(app, app.get(RedisService));
  await redisAdapter.connectToRedis();
  app.useWebSocketAdapter(redisAdapter);

  // Global prefix
  app.setGlobalPrefix('api');

  // HTTP middleware — gzip JSON feed/sync responses (task 5.1) and baseline
  // security headers via helmet defaults (task 5.2). This is a REST+WS API
  // backend, so helmet's browser-oriented defaults (CSP, etc.) are harmless
  // for API consumers while still providing header hardening for the Swagger
  // UI served at /api/docs.
  app.use(helmet());
  app.use(compression());

  // CORS — restrict to configured origins. NODE_ENV=production requires
  // FRONTEND_URL to be set (comma-separated list of allowed origins).
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Allow query/path string values to be implicitly converted to their
      // target primitive types (e.g. `?limit=100` → number) based on DTO
      // reflected types. Needed for `@Query()` params without manual
      // @Type(() => Number) everywhere, and fixes `limit must be an integer
      // number` 400s on /messages/sync and similar endpoints.
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Chat App API')
    .setDescription('Chat App REST + WebSocket API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Chat App running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
  console.log(`WebSocket at ws://localhost:${port}/chat`);
  const minioProto =
    process.env.MINIO_PUBLIC_USE_SSL === 'true' ? 'https' : 'http';
  const minioHost =
    process.env.MINIO_PUBLIC_HOST || process.env.MINIO_ENDPOINT || 'localhost';
  const minioPort =
    process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000';
  console.log(`MinIO public URL: ${minioProto}://${minioHost}:${minioPort}`);

  // ─── MinIO: Install 25h lifecycle policy on stories/ prefix ───────────────
  // This runs on every startup and is idempotent — duplicate lifecycle rules
  // are silently ignored by MinIO.
  try {
    await ensureBucketExists();
    const lifecycleConfig = {
      Rule: [
        {
          ID: 'stories-prefix-25h-expiry',
          Status: 'Enabled',
          Filter: { Prefix: 'stories/' },
          Expiration: { Days: 2 }, // 25h rounds up to 2 days minimum for MinIO
        },
      ],
    };
    await minioClient.setBucketLifecycle(BUCKET, lifecycleConfig);
    console.log(
      '[MinIO] stories/ prefix lifecycle policy installed (2-day expiry).',
    );
  } catch (err) {
    // Non-fatal — MinIO may not be running in test environments
    console.warn(
      '[MinIO] Failed to set lifecycle policy:',
      (err as Error).message,
    );
  }

  startDevEnvWatcher();
}

bootstrap();
