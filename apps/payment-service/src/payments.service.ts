import { Injectable, InternalServerErrorException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class PaymentService {
  constructor(private readonly supabase: SupabaseClient) {}

  async createPayment(dto: any) {
    const payload = {
      booking_id: dto.booking_id, customer_id: dto.customer_id, provider_id: dto.provider_id,
      amount: dto.amount, method: dto.method, status: dto.status || 'pending',
      paid_at: dto.status === 'completed' ? new Date().toISOString() : null,
      transaction_reference: dto.transaction_reference || null,
    };
    const { data, error } = await this.supabase.schema('payment').from('payments').insert([payload]).select().single();
    if (error) throw new InternalServerErrorException(`Failed to process payment: ${error.message}`);
    return { status: 'success', message: 'Payment processed successfully', data };
  }

  async getEarnings(providerId: string) {
    if (!providerId) throw new BadRequestException('Provider ID is required');
    const { data, error } = await this.supabase.schema('payment').from('payments').select('amount').eq('provider_id', providerId).eq('status', 'completed');
    if (error) throw new InternalServerErrorException(error.message);
    const total = data?.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) || 0;
    return { status: 'success', data: { provider_id: providerId, total_earnings: total } };
  }

  async getPaymentByBookingId(bookingId: string) {
    const { data, error } = await this.supabase.schema('payment').from('payments').select('*').eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(1).single();
    if (error && error.code === 'PGRST116') return { payment: null };
    if (error) throw new InternalServerErrorException(error.message);
    return { payment: data };
  }

  async getProviderPaymentHistory(providerId: string) {
    const { data, error } = await this.supabase.schema('payment').from('payments')
      .select('*')
      .eq('provider_id', providerId).order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    // Fetch booking details separately (cross-schema join not supported)
    const payments = await Promise.all((data || []).map(async (p: any) => {
      const { data: booking } = await this.supabase.schema('booking').from('bookings')
        .select('booking_reference, scheduled_at, service_id, customer_id').eq('id', p.booking_id).single();
      const { data: customerUser } = booking?.customer_id
        ? await this.supabase.schema('identity_and_user').from('users').select('full_name').eq('id', booking.customer_id).single()
        : { data: null };
      const { data: service } = booking?.service_id
        ? await this.supabase.schema('provider_catalog').from('provider_services').select('title').eq('id', booking.service_id).single()
        : { data: null };

      const platformFee = Number(p.amount) * 0.1;
      return {
        ...p,
        booking_reference: booking?.booking_reference || '',
        customer_name: customerUser?.full_name || '',
        service_title: service?.title || '',
        scheduled_at: booking?.scheduled_at,
        platform_fee: platformFee,
        net_earnings: Number(p.amount) - platformFee,
      };
    }));

    return { payments };
  }

  async getProviderEarningsSummary(providerId: string) {
    const { data, error } = await this.supabase.schema('payment').from('payments').select('amount, status, created_at').eq('provider_id', providerId);
    if (error) throw new InternalServerErrorException(error.message);

    const completed = (data || []).filter((p: any) => p.status === 'completed');
    const total = completed.reduce((acc: number, p: any) => acc + Number(p.amount), 0);
    const platformFees = total * 0.1;

    const now = new Date();
    const thisMonth = completed.filter((p: any) => { const d = new Date(p.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const monthlyTotal = thisMonth.reduce((acc: number, p: any) => acc + Number(p.amount), 0);

    return { total_earnings: total, net_earnings: total - platformFees, platform_fees: platformFees, monthly_earnings: monthlyTotal, completed_payments: completed.length };
  }

  async ensureBookingPayment(body: any) {
    const { data: existing } = await this.supabase.schema('payment').from('payments').select('*').eq('booking_id', body.bookingId).limit(1).single();
    if (existing) {
      if (body.amount && Number(existing.amount) !== Number(body.amount)) {
        const { data, error } = await this.supabase.schema('payment').from('payments').update({ amount: body.amount }).eq('id', existing.id).select().single();
        if (error) throw new InternalServerErrorException(error.message);
        return { payment: data };
      }
      return { payment: existing };
    }
    const { data, error } = await this.supabase.schema('payment').from('payments').insert([{
      booking_id: body.bookingId, customer_id: body.customerId, provider_id: body.provider_id,
      amount: body.amount, method: body.method || 'cash_on_service', status: 'pending',
    }]).select().single();
    if (error) throw new InternalServerErrorException(error.message);
    return { payment: data };
  }

  async markBookingPaymentPaid(body: any) {
    const updates: any = { status: 'completed', paid_at: new Date().toISOString() };
    if (body.amount) updates.amount = body.amount;
    if (body.method) updates.method = body.method;

    const { data, error } = await this.supabase.schema('payment').from('payments').update(updates).eq('booking_id', body.bookingId).select().single();
    if (error) throw new InternalServerErrorException(error.message);
    return { payment: data };
  }

  async cancelBookingPayment(bookingId: string) {
    const { data, error } = await this.supabase.schema('payment').from('payments').update({ status: 'cancelled' }).eq('booking_id', bookingId).select().single();
    if (error && error.code === 'PGRST116') return { payment: null };
    if (error) throw new InternalServerErrorException(error.message);
    return { payment: data };
  }

  async updateBookingPaymentAmount(bookingId: string, amount: number) {
    const { data, error } = await this.supabase.schema('payment').from('payments').update({ amount }).eq('booking_id', bookingId).select().single();
    if (error) throw new InternalServerErrorException(error.message);
    return { payment: data };
  }
}
