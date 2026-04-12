import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class BookingService {
  constructor(private readonly supabase: SupabaseClient) {}

  async createBooking(dto: any, customerId: string) {
    const { data: userRecord, error: userError } = await this.supabase
      .schema('identity_and_user').from('users').select('role, status').eq('id', dto.provider_id).single();
    if (userError || !userRecord) throw new NotFoundException('Provider not found in the system.');
    if (userRecord.role !== 'provider') throw new BadRequestException('Bookings can only be made with registered providers.');

    const { data: profileRecord, error: profileError } = await this.supabase
      .schema('provider_catalog').from('provider_profiles').select('verification_status').eq('user_id', dto.provider_id).single();
    if (profileError || !profileRecord) throw new BadRequestException('Provider profile is missing or incomplete.');

    if (userRecord.status !== 'active' || profileRecord.verification_status !== 'approved') {
      throw new BadRequestException({ message: 'Booking rejected: This provider is not yet fully verified.', account_status: userRecord.status, profile_verification: profileRecord.verification_status });
    }

    const totalAmount = dto.total_amount ?? (dto.hourly_rate || 0) * (dto.hours_required || 1);
    const bookingRef = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;

    const { data: newBooking, error: bookingError } = await this.supabase.schema('booking').from('bookings')
      .insert([{
        booking_reference: bookingRef, customer_id: customerId, provider_id: dto.provider_id,
        service_id: dto.service_id, service_address: dto.service_address,
        scheduled_at: dto.scheduled_at,
        hourly_rate: dto.hourly_rate, hours_required: dto.hours_required,
        total_amount: totalAmount, status: 'pending',
      }]).select().single();
    if (bookingError) throw new BadRequestException(bookingError.message);
    return { message: 'Booking successfully created!', booking: newBooking };
  }

  async getCustomerBookings(customerId: string) {
    const { data, error } = await this.supabase.schema('booking').from('bookings')
      .select('*')
      .eq('customer_id', customerId).order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    // Fetch provider info separately (cross-schema join not supported)
    const bookings = await Promise.all((data || []).map(async (booking: any) => {
      const { data: providerUser } = await this.supabase.schema('identity_and_user').from('users')
        .select('full_name, contact_number').eq('id', booking.provider_id).single();
      const { data: providerProfile } = await this.supabase.schema('provider_catalog').from('provider_profiles')
        .select('business_name, average_rating').eq('user_id', booking.provider_id).single();
      return { ...booking, provider: { ...(providerUser || {}), ...(providerProfile || {}) } };
    }));

    return { bookings };
  }

  async getHistory() {
    const { data, error } = await this.supabase.schema('booking').from('bookings').select('*').in('status', ['completed', 'cancelled', 'disputed']);
    if (error) throw new BadRequestException(error.message);
    return { history: data };
  }

  async getRequests() {
    const { data, error } = await this.supabase.schema('booking').from('bookings').select('*').eq('status', 'pending');
    if (error) throw new BadRequestException(error.message);
    return { requests: data };
  }

  async getBookingById(id: string) {
    const { data, error } = await this.supabase.schema('booking').from('bookings')
      .select('*')
      .eq('id', id).single();
    if (error) { if (error.code === 'PGRST116') throw new NotFoundException('Booking not found'); throw new InternalServerErrorException(error.message); }

    // Fetch provider and customer info separately (cross-schema join not supported)
    const [providerUser, providerProfile, customerUser] = await Promise.all([
      this.supabase.schema('identity_and_user').from('users').select('full_name, contact_number').eq('id', data.provider_id).single(),
      this.supabase.schema('provider_catalog').from('provider_profiles').select('business_name, average_rating').eq('user_id', data.provider_id).single(),
      this.supabase.schema('identity_and_user').from('users').select('full_name, contact_number').eq('id', data.customer_id).single(),
    ]);

    return {
      booking: {
        ...data,
        provider: { ...(providerUser.data || {}), ...(providerProfile.data || {}) },
        customer: customerUser.data || {},
      },
    };
  }

  async updateStatus(id: string, status: string) {
    const { data, error } = await this.supabase.schema('booking').from('bookings').update({ status }).eq('id', id).select().single();
    if (error) { if (error.code === 'PGRST116') throw new NotFoundException(`Booking with id ${id} not found`); throw new BadRequestException(error.message); }
    return { message: 'Booking status updated successfully.', booking: data };
  }

  async cancelBooking(id: string, userId: string, reason: string, explanation: string) {
    const { data, error } = await this.supabase.schema('booking').from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id).select().single();
    if (error) throw new BadRequestException(error.message);

    const { error: cancellationError } = await this.supabase.schema('booking').from('bookings_cancellations')
      .insert([{ booking_id: id, cancelled_by: userId, reason, detailed_explanation: explanation }]);
    if (cancellationError) throw new BadRequestException(cancellationError.message);

    return { booking: data };
  }

  async getAttachments(bookingId: string) {
    const { data, error } = await this.supabase.schema('booking').from('booking_attachments')
      .select('id, booking_id, file_url, file_name, mime_type, created_at').eq('booking_id', bookingId);
    if (error) throw new InternalServerErrorException(error.message);
    return { attachments: data || [] };
  }

  async saveAttachments(bookingId: string, attachments: any[]) {
    if (!attachments?.length) return { attachments: [] };
    const payload = attachments.map((a: any, i: number) => ({
      booking_id: bookingId, file_url: a.file_url || a.uri, file_name: a.file_name || a.label || `Attachment ${i + 1}`,
      mime_type: a.mime_type || 'image/jpeg', storage_path: a.storage_path || null,
    }));
    const { data, error } = await this.supabase.schema('booking').from('booking_attachments').insert(payload).select('id,booking_id,file_url,file_name,mime_type,created_at');
    if (error) throw new InternalServerErrorException(error.message);
    return { attachments: data || [] };
  }

  async createDispute(bookingId: string, userId: string, reason: string) {
    const { data, error } = await this.supabase.schema('notification_and_support').from('disputes')
      .insert([{ booking_id: bookingId, raised_by: userId, reason, status: 'open' }]).select().single();
    if (error) throw new InternalServerErrorException(error.message);
    return { dispute: data };
  }
}
