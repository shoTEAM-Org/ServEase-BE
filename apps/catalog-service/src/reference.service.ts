import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class ReferenceService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getCategories() {
    try {
      const { data, error } = await this.supabase.schema('provider_catalog').from('service_categories')
        .select('id, name, slug').eq('is_active', true).order('name', { ascending: true });
      if (error) throw new Error(error.message);
      return { message: 'Categories:', data };
    } catch (err: any) {
      console.error('Fetch Categories Error:', err.message);
      throw new InternalServerErrorException('Failed to GET service categories');
    }
  }
}
