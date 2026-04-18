import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { GatewayModule } from './gateway.module.js';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor.js';
import { ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  const app = await NestFactory.create(GatewayModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TimeoutInterceptor());
  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`ServEase Gateway is running on http://localhost:${port}`);
}
bootstrap();
