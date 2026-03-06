import { Module } from '@nestjs/common';
<<<<<<< HEAD
import { ConfigModule} from '@nestjs/config';
import { UsersModule } from './modules/users/users.module';
import { SupabaseModule } from './database/supabase.module';
import { ProviderModule } from './modules/provider/provider.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
    isGlobal: true,
  }),
    SupabaseModule,   
    ProviderModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})

=======
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    AuthModule, // This MUST be here to fix the 404
  ],
})
>>>>>>> origin/customer-registration
export class AppModule {}