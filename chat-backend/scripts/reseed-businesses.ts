/**
 * Standalone re-seed script for businesses.
 *
 * Drops all existing businesses + business_connections, then re-runs seed.
 * Use when you've changed the seed data and want to reset the DB.
 *
 * Usage:
 *   cd chat-backend
 *   npm run seed:businesses
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BusinessesService } from '../src/businesses/businesses.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('ReseedBusinesses');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(BusinessesService, { strict: false });
    logger.log('Wiping existing businesses + connections...');
    const { before, after } = await service.reseedForDevelopment();
    logger.log(`Before: ${before} businesses. After: ${after} seeded.`);
  } catch (err) {
    console.error('Reseed failed:', err);
    process.exitCode = 1;
  } finally {
    await app.close();
    setTimeout(() => process.exit(process.exitCode ?? 0), 300).unref();
  }
}

bootstrap();
