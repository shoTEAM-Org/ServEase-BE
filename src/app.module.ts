import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // For reading .env files
import { SupabaseModule } from './database/supabase.module';
import { ProviderModule } from './modules/provider/provider.module';

@Module({
  imports: [

    ConfigModule.forRoot({ isGlobal: true }), 
    
    SupabaseModule, 
    
    ProviderModule,
  ],
})
export class AppModule {}