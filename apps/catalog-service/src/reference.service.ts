import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { supabase } from '@app/database';

@Injectable()
export class ReferenceService {
  async getCategories() {
    try {
      const { data, error } = await supabase
        .from('service_categories')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw new Error(error.message);

      return { message: 'Categories:', data };
    } catch (err) {
      console.error('Fetch Categories Error:', err.message);
      throw new InternalServerErrorException('Failed to GET service categories');
    }
  }
}
