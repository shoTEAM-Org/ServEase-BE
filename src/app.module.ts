import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module'; // Import your feature module
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    AuthModule, // CRITICAL: This connects your routes to the server
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}