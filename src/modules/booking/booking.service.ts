import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingStatus, ProviderBookingResponseDto } from './dto/update-booking-status.dto';
import { ProviderCounterOfferDto } from './dto/booking-counter-offer.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';

@Injectable()
export class BookingService {
  
  constructor(private readonly supabase: SupabaseClient) {}

  async createBooking(dto: CreateBookingDto, customerId: string) {
    try {
      const { data: userRecord, error: userError } = await this.supabase
        .from('users')
        .select('role, status')
        .eq('id', dto.provider_id)
        .single();

      if (userError || !userRecord) {
        throw new NotFoundException('Provider not found in the system.');
      }

      if (userRecord.role !== 'provider') {
        throw new BadRequestException('Bookings can only be made with registered providers.');
      }

      const { data: profileRecord, error: profileError } = await this.supabase
        .from('provider_profiles')
        .select('verification_status')
        .eq('user_id', dto.provider_id) 
        .single();

      if (profileError || !profileRecord) {
        throw new BadRequestException('Provider profile is missing or incomplete.');
      }

      const isAccountActive = userRecord.status === 'active';
      const isProfileVerified = profileRecord.verification_status === 'approved';

      if (!isAccountActive || !isProfileVerified) {
        throw new BadRequestException({
            message: 'Booking rejected: This provider is not yet fully verified by the admin.',
            account_status: userRecord.status,
            profile_verification: profileRecord.verification_status
        });
      }

      const totalAmount = dto.hourly_rate * dto.hours_required;
      const bookingRef = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;
      const { data: newBooking, error: bookingError } = await this.supabase
      .from('bookings')
      .insert([{
        customer_id: customerId, 
        provider_id: dto.provider_id,
        service_id: dto.service_id,
        service_address: dto.service_address,
        scheduled_at: dto.scheduled_at,
        hourly_rate: dto.hourly_rate,
        hours_required: dto.hours_required,
        total_amount: totalAmount,
        status: BookingStatus.PENDING, 
        counter_offer: false 
      }])
      .select()
      .single();

      if (bookingError) throw new Error(bookingError.message);

      return {
        message: 'Booking successfully created!',
        booking: newBooking
      };

    } catch (err) {
      console.error('Booking Creation Error:', err.message);
      throw new BadRequestException(err.response || err.message);
    }
  }

  async providerCounterOffer(bookingId: string, providerId: string, dto: ProviderCounterOfferDto) {
    const { data: originalBooking, error: fetchError } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('provider_id', providerId)
      .single();

    if (fetchError || !originalBooking) {
      throw new NotFoundException(`Original booking not found or you do not have permission to access it.`);
    }


    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + dto.validity_hours);
    const newHourlyRate = dto.total_amount / dto.hours_required;


    const { data: newBooking, error: insertError } = await this.supabase
      .from('bookings')
      .insert([{
        customer_id: originalBooking.customer_id,
        provider_id: originalBooking.provider_id,
        service_id: originalBooking.service_id,
        service_address: originalBooking.service_address,

        scheduled_at: dto.scheduled_at,
        hourly_rate: newHourlyRate,
        hours_required: dto.hours_required,
        total_amount: dto.total_amount,
        status: BookingStatus.PENDING,
        counter_offer: true,          
        counter_offer_reason: dto.counter_offer_reason,
        counter_offer_expiry: expiresAt.toISOString()
      }])
      .select()
      .single();

    if (insertError) {
      throw new InternalServerErrorException(`Failed to generate counter offer: ${insertError.message}`);
    }

    await this.supabase
      .from('bookings')
      .update({ status: BookingStatus.PENDING, updated_at: new Date().toISOString() })
      .eq('id', originalBooking.id);

    return {
      status: 'success',
      message: 'Counter offer successfully generated as a new pending request.',
      data: newBooking,
    };
  }


  async getHistory() {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('*')
      .in('status', ['completed', 'cancelled', 'disputed']);

    if (error) {
      console.error('Booking History Error:', error.message);
      throw new BadRequestException(error.message);
    }

    return {
      history: data
    };
  }

  async getRequests() {
    const { data, error } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('status', 'pending');

    if (error) {
      console.error('Booking Requests Error:', error.message);
      throw new BadRequestException(error.message);
    }

    return {
      requests: data
    };
  }

  async updateStatus(id: string, status: string) {
    const { data, error } = await this.supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update Booking Status Error:', error.message);
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Booking with id ${id} not found`);
      }
      throw new BadRequestException(error.message);
    }

    return {
      message: 'Booking status updated successfully.',
      booking: data
    };
  }

  async providerBookingResponse(bookingId: string, providerId: string, dto: ProviderBookingResponseDto) {
    const { data: updatedBooking, error } = await this.supabase
      .from('bookings')
      .update({ 
        status: dto.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)
      .eq('provider_id', providerId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundException(`Booking not found or permission denied.`);
      throw new InternalServerErrorException(`Failed to update booking: ${error.message}`);
    }

    return {
      status: 'success',
      message: `Booking successfully ${dto.status === BookingStatus.CONFIRMED ? 'accepted' : 'rejected'}`,
      data: updatedBooking,
    };
  }

  async getMyBookings(bookingId: string, providerId: string) {
    const { data: booking, error } = await this.supabase
      .from('bookings')
      .select(`
        *,
        customer_profiles!customer_id (
          full_name,
          contact_number
        )
      `)
      .eq('id', bookingId)
      .eq('provider_id', providerId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Booking not found or you do not have permission to view it.`);
      }
      throw new InternalServerErrorException(`Failed to fetch booking details: ${error.message}`);
    }

    const totalAmount = Number(booking.total_amount);
    const platformFee = totalAmount * 0.10; 
    const earnings = totalAmount - platformFee;

    const canSeeContact = ['confirmed', 'in_progress', 'completed'].includes(booking.status);
    const contactNumber = canSeeContact ? booking.customer_profiles?.contact_number : null;

    return {
      status: 'success',
      data: {
        id: booking.id,
        booking_reference: booking.booking_reference,
        status: booking.status,
        customer: {
          full_name: booking.customer_profiles?.full_name || 'Unknown Customer',
          contact_number: contactNumber,
        },
        pricing: {
          service_fee: totalAmount,
          platform_fee: platformFee,
          your_earnings: earnings,
        },
        service_details: {
          service_type: booking.services?.name || 'Standard Service', 
          scheduled_at: booking.scheduled_at,
          location: booking.service_address,
          estimated_duration: booking.hours_required,
        }
      }
    };
  }

  async cancelBooking(bookingId: string, providerId: string, dto: CancelBookingDto) {
    // 1. Fetch the booking to get the scheduled_at time and total_amount
    const { data: booking, error: fetchError } = await this.supabase
      .from('bookings')
      .select('scheduled_at, total_amount, status')
      .eq('id', bookingId)
      .eq('provider_id', providerId)
      .single();

    if (fetchError || !booking) {
      throw new NotFoundException(`Booking not found or you do not have permission to modify it.`);
    }

    if (['cancelled', 'completed'].includes(booking.status)) {
      throw new BadRequestException(`This booking cannot be cancelled because it is already ${booking.status}.`);
    }

    const scheduledDate = new Date(booking.scheduled_at);
    const now = new Date();
    const diffInMs = scheduledDate.getTime() - now.getTime();
    const hoursUntilBooking = diffInMs / (1000 * 60 * 60);
    
    const isWithin48Hours = hoursUntilBooking > 0 && hoursUntilBooking <= 48;
    const penaltyFee = isWithin48Hours ? 250.00 : 0.00;

    const refundAmount = Number(booking.total_amount);

    const { data: cancellationRecord, error: insertError } = await this.supabase
      .from('bookings_cancellations')
      .insert([{
        booking_id: bookingId,
        cancelled_by: providerId,
        reason: dto.reason,
        detailed_explanation: dto.detailed_explanation,
        penalty_fee: penaltyFee,
        refund_amount: refundAmount,
        refund_status: 'pending' 
      }])
      .select()
      .single();

    if (insertError) {
      throw new InternalServerErrorException(`Failed to log cancellation: ${insertError.message}`);
    }

    const { error: updateError } = await this.supabase
      .from('bookings')
      .update({ 
        status: 'cancelled', 
        updated_at: now.toISOString() 
      })
      .eq('id', bookingId);

    if (updateError) {
      throw new InternalServerErrorException(`Cancellation logged, but failed to update main booking status: ${updateError.message}`);
    }

    return {
      status: 'success',
      message: penaltyFee > 0 
        ? 'Booking cancelled. A penalty fee of ₱250 has been applied due to the 48-hour policy.' 
        : 'Booking cancelled successfully with no penalty fee.',
      data: cancellationRecord
    };
  }
}