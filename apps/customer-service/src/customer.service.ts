import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class CustomerService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getDashboardData(customerId: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('id, booking_reference, status, scheduled_at, total_amount, created_at, updated_at, provider_id')
      .eq('customer_id', customerId)
      .in('status', ['pending', 'completed']);
    if (error)
      throw new InternalServerErrorException(error.message);

    // Fetch provider info separately (cross-schema join not supported)
    return Promise.all((data || []).map(async (booking: any) => {
      const { data: providerUser } = await this.supabase
        .schema('identity_and_user').from('users')
        .select('full_name, contact_number').eq('id', booking.provider_id).single();
      const { data: providerProfile } = await this.supabase
        .schema('provider_catalog').from('provider_profiles')
        .select('business_name, total_reviews, average_rating').eq('user_id', booking.provider_id).single();

      return {
        id: booking.id,
        booking_reference: booking.booking_reference,
        status: booking.status,
        scheduled_at: booking.scheduled_at,
        total_amount: booking.total_amount,
        created_at: booking.created_at,
        updated_at: booking.updated_at,
        provider: {
          full_name: providerUser?.full_name || '',
          contact_number: providerUser?.contact_number || '',
          business_name: providerProfile?.business_name || 'N/A',
          total_reviews: providerProfile?.total_reviews || 0,
          average_rating: providerProfile?.average_rating || 0,
        },
      };
    }));
  }

  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .schema('identity_and_user')
      .from('customer_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116')
      throw new InternalServerErrorException(error.message);
    return data || { user_id: userId };
  }

  async updateProfile(userId: string, updates: Record<string, any>) {
    const { data, error } = await this.supabase
      .schema('identity_and_user')
      .from('customer_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();
    if (error)
      throw new InternalServerErrorException(error.message);
    return data;
  }
}
