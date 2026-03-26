import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { GatewayModule } from './gateway.module';
import { ensureKafkaTopics } from './kafka-setup';

async function bootstrap() {
  // Wait for Kafka to be fully ready and pre-create all topics
  // before NestJS tries to subscribe consumers in onModuleInit()
  await ensureKafkaTopics();

  const app = await NestFactory.create(GatewayModule);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(process.env.PORT || 5000);
  console.log('API Gateway is running on http://localhost:5000');
}
bootstrap();
