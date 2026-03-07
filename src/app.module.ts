import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module'; 
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ServicesModule } from './modules/services/services.module';

@Module({
  imports: [
    AuthModule,
    ServicesModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}