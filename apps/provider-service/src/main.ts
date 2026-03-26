import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { KafkaLoggingInterceptor } from '@app/common';
import { ProviderServiceModule } from './provider-service.module';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3000;

async function bootstrap(retryCount = 0) {
  try {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(ProviderServiceModule, {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'provider-service',
          brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          retry: { initialRetryTime: 300, retries: 10 },
        },
        consumer: {
          groupId: 'provider-service-group',
          retry: { initialRetryTime: 300, retries: 10 },
        },
        producer: { createPartitioner: Partitioners.LegacyPartitioner },
      },
    });
    app.useGlobalInterceptors(new KafkaLoggingInterceptor());
    await app.listen();
    console.log('Provider Service is running');
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.warn(`Provider Service failed to start (attempt ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
      console.warn(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return bootstrap(retryCount + 1);
    }
    console.error('Provider Service failed to start after max retries:', error);
    process.exit(1);
  }
}
bootstrap();
