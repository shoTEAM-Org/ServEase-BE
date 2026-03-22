import { Global, Module } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
  ],
  exports: [SupabaseClient], 
})
export class SupabaseModule {}