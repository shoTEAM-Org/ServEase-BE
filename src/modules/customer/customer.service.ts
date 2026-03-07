import {Injectable, InternalServerErrorException} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class CustomerService {
    
    constructor(private readonly supabase: SupabaseClient) {}

    async getDashboardData(customerId: string) {
        const {data, error } = await this.supabase
            .from('bookings')
            .select('*,users!provider_id(full_name, contact_number, provider_profiles (business_name,average_rating,total_reviews))')
            .eq('customer_id', customerId)
            .in('status', ['pending', 'completed']);

            if (error) {
                throw new InternalServerErrorException(error.message);
            }
            return data;
    }
}