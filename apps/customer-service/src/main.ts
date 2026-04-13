import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { CustomerServiceModule } from './customer-service.module.js';
import { ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(CustomerServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'customer-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'customer-service-consumer' },
    },
  });
  await app.listen();
  console.log('Customer Service is listening on Kafka');
}
bootstrap();
