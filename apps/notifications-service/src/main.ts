import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotificationsServiceModule } from './notifications-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'notifications-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationsServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'notifications-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'notifications-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'notifications-service');
  await app.listen();
  console.log('Notifications Service is listening on Kafka');
}
bootstrap();
