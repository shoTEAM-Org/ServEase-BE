import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);

  app.useGlobalPipes(new ValidationPipe());

  await app.listen(process.env.PORT || 5000);
  console.log('API Gateway is running on http://localhost:5000');
}
bootstrap();
