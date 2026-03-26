import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { GatewayModule } from './gateway.module';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3000;

async function bootstrap(retryCount = 0) {
  try {
    const app = await NestFactory.create(GatewayModule);
    app.useGlobalPipes(new ValidationPipe());
    await app.listen(process.env.PORT || 5000);
    console.log('API Gateway is running on http://localhost:5000');
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.warn(`API Gateway failed to start (attempt ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
      console.warn(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return bootstrap(retryCount + 1);
    }
    console.error('API Gateway failed to start after max retries:', error);
    process.exit(1);
  }
}
bootstrap();
