import { Module } from '@nestjs/common';
import { ConfigModule} from '@nestjs/config';
import { UsersModule } from './modules/users/users.module';
import { SupabaseModule } from './database/supabase.module';
import { ProviderModule } from './modules/provider/provider.module';
import { AuthModule } from './modules/auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CustomerModule } from './modules/customer/customer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
    isGlobal: true,
  }),
    SupabaseModule,   
    ProviderModule,
    UsersModule,
    AuthModule,
    CustomerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}