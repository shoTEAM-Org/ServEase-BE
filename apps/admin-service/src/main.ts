import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AdminServiceModule } from './admin-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'admin-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AdminServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'admin-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'admin-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'admin-service');
  await app.listen();
  console.log('Admin Service is listening on Kafka');
}
bootstrap();
