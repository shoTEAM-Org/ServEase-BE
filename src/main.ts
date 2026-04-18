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
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TimeoutInterceptor());
  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`ServEase Gateway is running on http://localhost:${port}`);
}
bootstrap();
