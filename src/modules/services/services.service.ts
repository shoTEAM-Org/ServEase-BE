import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { supabase } from '../../../src/config/supabaseClient';

@Injectable()
export class ServicesService {
  async searchServices(keyword?: string) {
    try {
      let query = supabase
        .from('provider_services')
        .select(`
          id,
          title,
          price,
          description,
          service_categories!inner (
            id,
            name,
            slug
          ),
          provider_profiles!inner (
            user_id,
            business_name,
            trust_score
          )
        `);

      if (keyword) {
        query = query.ilike('service_categories.name', `%${keyword}%`);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Supabase Query Failed: ${error.message}`);

      const sortedResults = data.sort((a, b) => {
        const scoreA = a.provider_profiles?.trust_score || 0;
        const scoreB = b.provider_profiles?.trust_score || 0;
        return scoreB - scoreA; 
      });

      return {
        status: 200,
        message: 'Search successful',
        results: sortedResults,
      };

    } catch (err) {
      console.error('Search Error:', err.message);
      throw new InternalServerErrorException(err.message);
    }
  }
}