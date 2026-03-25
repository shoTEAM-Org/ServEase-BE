import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CustomerDashboardResponseDto } from '@app/common';

@Injectable()
export class CustomerService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getDashboardData(customerId: string): Promise<CustomerDashboardResponseDto[]> {
    const { data, error } = await this.supabase
      .from('bookings')
      .select(`
        id, booking_reference, status, scheduled_at, total_amount, created_at, updated_at,
        users!provider_id (full_name, contact_number, provider_profiles (business_name, total_reviews, average_rating))
      `)
      .eq('customer_id', customerId)
      .in('status', ['pending', 'completed']);

    if (error) throw new InternalServerErrorException(error.message);

    return data.map((booking: any) => ({
      id: booking.id,
      booking_reference: booking.booking_reference,
      status: booking.status,
      scheduled_at: booking.scheduled_at,
      total_amount: booking.total_amount,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
      provider: {
        full_name: booking.users.full_name,
        contact_number: booking.users.contact_number,
        business_name: booking.users.provider_profiles?.business_name || 'N/A',
        total_reviews: booking.users.provider_profiles?.total_reviews || 0,
        average_rating: booking.users.provider_profiles?.average_rating || 0,
      },
    }));
  }
}
