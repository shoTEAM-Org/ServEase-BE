import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotificationsServiceModule } from './notifications-service.module.js';
import { ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationsServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'notifications-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'notifications-service-consumer' },
    },
  });
  await app.listen();
  console.log('Notifications Service is listening on Kafka');
}
bootstrap();
