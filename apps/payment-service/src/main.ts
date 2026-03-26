import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { KafkaLoggingInterceptor } from '@app/common';
import { PaymentServiceModule } from './payment-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(PaymentServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'payment-service',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      consumer: { groupId: 'payment-service-group' },
      producer: { createPartitioner: Partitioners.LegacyPartitioner },
    },
  });
  app.useGlobalInterceptors(new KafkaLoggingInterceptor());
  await app.listen();
  console.log('Payment Service is running');
}
bootstrap();
