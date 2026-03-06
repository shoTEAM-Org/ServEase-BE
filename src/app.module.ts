import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    AuthModule, // This MUST be here to fix the 404
  ],
})
export class AppModule {}