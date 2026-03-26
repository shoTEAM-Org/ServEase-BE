import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { KafkaLoggingInterceptor } from '@app/common';
import { AdminServiceModule } from './admin-service.module';

const MAX_RETRIES = 15;
const RETRY_DELAY_MS = 5000;

async function bootstrap(retryCount = 0) {
  try {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(AdminServiceModule, {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'admin-service',
          brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          retry: { initialRetryTime: 1000, retries: 15 },
        },
        consumer: {
          groupId: 'admin-service-group',
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
    console.log('Admin Service is running');
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.warn(`Admin Service failed to start (attempt ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
      console.warn(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return bootstrap(retryCount + 1);
    }
    console.error('Admin Service failed to start after max retries:', error);
    process.exit(1);
  }
}
bootstrap();
