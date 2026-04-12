import { Global, Module } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config'; // Added for MESSAGES_CLIENT injection
// TODO: Ensure you import CircuitBreaker and createResilientProxy from your local project utilities

// Added export constants per the migration guide
export const IDENTITY_CLIENT = 'IDENTITY_CLIENT';
export const CATALOG_CLIENT = 'CATALOG_CLIENT';
export const BOOKING_CLIENT = 'BOOKING_CLIENT';
export const PAYMENT_CLIENT = 'PAYMENT_CLIENT';
export const TRUST_CLIENT = 'TRUST_CLIENT';
export const NOTIFICATION_CLIENT = 'NOTIFICATION_CLIENT';
export const MESSAGES_CLIENT = 'MESSAGES_CLIENT'; // [cite: 170]

@Global() 
@Module({
  providers: [
    {
      provide: SupabaseClient, 
      useFactory: () => {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SECRET_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error('Supabase URL and Key are missing from environment variables.');
        }

        return createClient(supabaseUrl, supabaseKey);
      },
    },
    // --- ADDED MESSAGES_CLIENT PROVIDER ---
    {
      provide: MESSAGES_CLIENT, // [cite: 173]
      inject: [ConfigService], // [cite: 174]
      useFactory: (configService: ConfigService) => { // [cite: 175]
        const url = configService.get<string>('SUPABASE_URL'); // [cite: 176]
        const key = configService.get<string>('SUPABASE_SECRET_KEY'); // [cite: 177]
        const client = createClient(url, key); // [cite: 180]
        const breaker = new CircuitBreaker('MESSAGES_SERVICE'); // [cite: 181]
        return createResilientProxy(client.schema('messages'), breaker); // [cite: 182]
      },
    },
  ],
  exports: [
    SupabaseClient,
    // --- ADDED EXPORTS ---
    IDENTITY_CLIENT, // [cite: 188]
    CATALOG_CLIENT, // [cite: 189]
    BOOKING_CLIENT, // [cite: 190]
    PAYMENT_CLIENT, // [cite: 191]
    TRUST_CLIENT, // [cite: 192]
    NOTIFICATION_CLIENT, // [cite: 193]
    MESSAGES_CLIENT, // [cite: 194]
  ], 
})
export class SupabaseModule {}