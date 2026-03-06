import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
<<<<<<< HEAD

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
=======
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe());
  
 
  app.setGlobalPrefix('api/v1'); 
  
  await app.listen(5000);
  console.log('Server is running on http://localhost:5000');
}
bootstrap();
>>>>>>> origin/customer-registration
