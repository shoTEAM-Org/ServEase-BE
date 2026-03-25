import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { supabase } from '@app/database';
import { CreateBookingDto, KAFKA_TOPICS } from '@app/common';

@Injectable()
export class BookingService {

  async createBooking(dto: CreateBookingDto, customerId: string) {
    try {
      const { data: userRecord, error: userError } = await supabase
        .from('users')
        .select('role, status')
        .eq('id', dto.provider_id)
        .single();

      if (userError || !userRecord) throw new NotFoundException('Provider not found in the system.');
      if (userRecord.role !== 'provider') throw new BadRequestException('Bookings can only be made with registered providers.');

      const { data: profileRecord, error: profileError } = await supabase
        .from('provider_profiles')
        .select('verification_status')
        .eq('user_id', dto.provider_id)
        .single();

      if (profileError || !profileRecord) throw new BadRequestException('Provider profile is missing or incomplete.');

      const isAccountActive = userRecord.status === 'active';
      const isProfileVerified = profileRecord.verification_status === 'approved';

      if (!isAccountActive || !isProfileVerified) {
        throw new BadRequestException({
          message: 'Booking rejected: This provider is not yet fully verified by the admin.',
          account_status: userRecord.status,
          profile_verification: profileRecord.verification_status,
        });
      }

      const totalAmount = dto.hourly_rate * dto.hours_required;
      const bookingRef = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;

      const { data: newBooking, error: bookingError } = await supabase
        .from('bookings')
        .insert([{
          booking_reference: bookingRef,
          customer_id: customerId,
          provider_id: dto.provider_id,
          service_id: dto.service_id,
          service_address: dto.service_address,
          scheduled_at: dto.scheduled_at,
          hourly_rate: dto.hourly_rate,
          hours_required: dto.hours_required,
          total_amount: totalAmount,
          status: 'pending',
        }])
        .select()
        .single();

      if (bookingError) throw new Error(bookingError.message);

      return {
        message: 'Booking successfully created!',
        booking: newBooking,
      };
    } catch (err) {
      console.error('Booking Creation Error:', err.message);
      throw new BadRequestException(err.response || err.message);
    }
  }

  async getHistory() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .in('status', ['completed', 'cancelled', 'disputed']);

    if (error) throw new BadRequestException(error.message);
    return { history: data };
  }

  async getRequests() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('status', 'pending');

    if (error) throw new BadRequestException(error.message);
    return { requests: data };
  }

  async updateStatus(id: string, status: string) {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundException(`Booking with id ${id} not found`);
      throw new BadRequestException(error.message);
    }

    return {
      message: 'Booking status updated successfully.',
      booking: data,
    };
  }
}
