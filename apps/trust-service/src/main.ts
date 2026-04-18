import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { TrustServiceModule } from './trust-service.module.js';
import { ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    TrustServiceModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'trust-service',
          brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
        },
        consumer: { groupId: 'trust-service-consumer' },
      },
    },
  );
  await app.listen();
  console.log('Trust Service is listening on Kafka');
}
bootstrap();

