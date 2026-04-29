import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { GatewayModule } from './gateway.module.js';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor.js';
import { enableGatewayTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'gateway';
  const app = await NestFactory.create(GatewayModule);
  enableGatewayTracing(app, 'gateway');
  app.enableCors({
    origin(origin, callback) {
      const allowedOrigins = new Set([
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8081',
        'http://localhost:8082',
        'http://localhost:19006',
      ]);
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        origin.startsWith('exp://') ||
        /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TimeoutInterceptor());
  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`ServEase Gateway is running on http://localhost:${port}`);
}
bootstrap();
