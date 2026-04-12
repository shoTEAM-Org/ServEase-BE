import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ProviderServiceModule } from './provider-service.module.js';
import { ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ProviderServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'provider-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'provider-service-consumer' },
    },
  });
  await app.listen();
  console.log('Provider Service is listening on Kafka');
}
bootstrap();
