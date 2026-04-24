import {
  Inject,
  Injectable,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { AUTH_PATTERNS, BOOKING_PATTERNS, sendKafkaRpcRequest } from '@app/common';

@Injectable()
export class CustomerService implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_CUSTOMER_BOOKINGS);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_CUSTOMER_PROFILE);
    await this.kafka.connect();
  }

  private async request<T = any>(pattern: string, payload: unknown): Promise<T> {
    return await sendKafkaRpcRequest(
      () => this.kafka.send<T, unknown>(pattern, payload),
      { context: pattern },
    );
  }

  private async emit(pattern: string, payload: unknown): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.kafka.emit(pattern, payload).subscribe({
        complete: () => resolve(),
        error: (error) => reject(error),
      });
    });
  }

  private toTrimmedString(value: unknown) {
    return String(value ?? '').trim();
  }

  private isMissingRelationError(error: any) {
    const code = this.toTrimmedString(error?.code).toUpperCase();
    const message = this.toTrimmedString(error?.message).toLowerCase();
    return (
      code === '42P01' ||
      code === 'PGRST106' ||
      ((message.includes('relation') || message.includes('schema')) &&
        message.includes('does not exist'))
    );
  }

  private pickUserProfileUpdates(source: Record<string, any>) {
    const allowed = ['full_name', 'contact_number', 'date_of_birth'];
    const filtered: Record<string, any> = {};
    for (const key of allowed) {
      if (source[key] !== undefined) filtered[key] = source[key];
    }
    return filtered;
  }

  private pickCustomerProfileUpdates(source: Record<string, any>) {
    const allowed = [
      'address',
      'city',
      'province',
      'region',
      'barangay',
      'zip_code',
      'postal_code',
      'landmark',
    ];
    const filtered: Record<string, any> = {};
    for (const key of allowed) {
      if (source[key] !== undefined) filtered[key] = source[key];
    }
    return filtered;
  }

  async getDashboardData(customerId: string) {
    const bookingResponse = await this.request<any>(
      BOOKING_PATTERNS.GET_CUSTOMER_BOOKINGS,
      { customerId },
    );
    const bookings = Array.isArray(bookingResponse?.bookings)
      ? bookingResponse.bookings
      : [];

    return bookings
      .filter((booking: any) =>
        ['pending', 'completed'].includes(this.toTrimmedString(booking?.status)),
      )
      .map((booking: any) => ({
        id: booking.id,
        booking_reference: booking.booking_reference,
        status: booking.status,
        scheduled_at: booking.scheduled_at,
        total_amount: booking.total_amount,
        created_at: booking.created_at,
        updated_at: booking.updated_at,
        provider: {
          full_name: booking?.provider?.full_name || '',
          contact_number: booking?.provider?.contact_number || '',
          business_name: booking?.provider?.business_name || 'N/A',
          total_reviews: Number(booking?.provider?.total_reviews || 0),
          average_rating: Number(booking?.provider?.average_rating || 0),
        },
      }));
  }

  async getProfile(userId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    return await this.request<any>(AUTH_PATTERNS.GET_CUSTOMER_PROFILE, {
      userId: normalizedUserId,
    });
  }

  async updateProfile(userId: string, updates: Record<string, any>) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    const source = updates || {};
    const userUpdates = this.pickUserProfileUpdates(source);
    const profileUpdates = this.pickCustomerProfileUpdates(source);

    if (Object.keys(userUpdates).length === 0 && Object.keys(profileUpdates).length === 0) {
      throw new BadRequestException('No valid profile fields provided');
    }

    if (Object.keys(userUpdates).length > 0) {
      await this.emit(AUTH_PATTERNS.UPDATE_PROFILE, {
        userId: normalizedUserId,
        ...userUpdates,
      });
    }

    if (Object.keys(profileUpdates).length > 0) {
      await this.emit(AUTH_PATTERNS.UPDATE_CUSTOMER_PROFILE, {
        userId: normalizedUserId,
        ...profileUpdates,
      });
    }

    return {
      user_id: normalizedUserId,
      ...userUpdates,
      ...profileUpdates,
    };
  }
}
