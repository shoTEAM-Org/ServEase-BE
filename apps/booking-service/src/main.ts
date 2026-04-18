import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { BookingServiceModule } from './booking-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'booking-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(BookingServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'booking-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'booking-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'booking-service');
  await app.listen();
  console.log('Booking Service is listening on Kafka');
}
bootstrap();
