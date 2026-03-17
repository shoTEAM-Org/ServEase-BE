import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly supabase: SupabaseClient) {}

  async createPayment(dto: CreatePaymentDto) {
    const paymentPayload = {
      booking_id: dto.booking_id,
      customer_id: dto.customer_id,
      provider_id: dto.provider_id,
      amount: dto.amount,
      method: dto.method,
      status: dto.status || 'pending', 
      paid_at: (dto.status === 'completed') ? new Date().toISOString() : null,
      transaction_reference: dto.transaction_reference || null,
    };

    const { data: newPayment, error: insertError } = await this.supabase
      .from('payments')
      .insert([paymentPayload])
      .select()
      .single();

    if (insertError) {
      throw new InternalServerErrorException(`Failed to process payment: ${insertError.message}`);
    }

    return {
      status: 'success',
      message: 'Payment processed successfully',
      data: newPayment,
    };
  }

  async getEarnings(providerId: string) {
    if (!providerId) {
      throw new BadRequestException('Provider ID is required to fetch earnings');
    }

    // Fetch only the amount for completed payments belonging to the provider
    const { data: payments, error: fetchError } = await this.supabase
      .from('payments')
      .select('amount')
      .eq('provider_id', providerId)
      .eq('status', 'completed'); // Adjust this string if your payment_status enum differs

    if (fetchError) {
      throw new InternalServerErrorException(`Error fetching earnings: ${fetchError.message}`);
    }

    
    const totalEarnings = payments?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

    return {
      status: 'success',
      data: {
        provider_id: providerId,
        total_earnings: totalEarnings,
      }
    };
  }
}