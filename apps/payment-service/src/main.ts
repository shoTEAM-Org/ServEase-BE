import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { KafkaLoggingInterceptor } from '@app/common';
import { PaymentServiceModule } from './payment-service.module';

const MAX_RETRIES = 15;
const RETRY_DELAY_MS = 5000;

async function bootstrap(retryCount = 0) {
  try {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(PaymentServiceModule, {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'payment-service',
          brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          retry: { initialRetryTime: 1000, retries: 15 },
        },
        consumer: {
          groupId: 'payment-service-group',
          retry: { initialRetryTime: 1000, retries: 15 },
        },
        producer: {
          createPartitioner: Partitioners.LegacyPartitioner,
          allowAutoTopicCreation: true,
        },
      },
    });
    app.useGlobalInterceptors(new KafkaLoggingInterceptor());
    await app.listen();
    console.log('Payment Service is running');
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.warn(`Payment Service failed to start (attempt ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
      console.warn(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return bootstrap(retryCount + 1);
    }
    console.error('Payment Service failed to start after max retries:', error);
    process.exit(1);
  }
}
bootstrap();
