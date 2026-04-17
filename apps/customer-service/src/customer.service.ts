import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class CustomerService {
  constructor(private readonly supabase: SupabaseClient) {}
  private readonly identitySchemas = ['identity_and_user', 'identity_svc'] as const;

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
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    let lastError: any = null;
    for (const schemaName of this.identitySchemas) {
      const { data, error } = await this.supabase
        .schema(schemaName)
        .from('customer_profiles')
        .select('*')
        .eq('user_id', normalizedUserId)
        .maybeSingle();
      if (!error) return data || { user_id: normalizedUserId };
      lastError = error;
      if (!this.isMissingRelationError(error)) break;
    }

    throw new InternalServerErrorException(lastError?.message || 'Failed to fetch customer profile');
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
      let userUpdateError: any = null;
      for (const schemaName of this.identitySchemas) {
        const { error } = await this.supabase
          .schema(schemaName)
          .from('users')
          .update(userUpdates)
          .eq('id', normalizedUserId);
        if (!error) {
          userUpdateError = null;
          break;
        }
        userUpdateError = error;
        if (!this.isMissingRelationError(error)) break;
      }

      if (userUpdateError) {
        throw new InternalServerErrorException(userUpdateError.message);
      }
    }

    if (Object.keys(profileUpdates).length === 0) {
      return { user_id: normalizedUserId };
    }

    let lastProfileError: any = null;
    for (const schemaName of this.identitySchemas) {
      const { data: updatedProfile, error: updateError } = await this.supabase
        .schema(schemaName)
        .from('customer_profiles')
        .update(profileUpdates)
        .eq('user_id', normalizedUserId)
        .select()
        .maybeSingle();

      if (!updateError && updatedProfile) return updatedProfile;
      if (!updateError && !updatedProfile) {
        const { data: insertedProfile, error: insertError } = await this.supabase
          .schema(schemaName)
          .from('customer_profiles')
          .insert([{ user_id: normalizedUserId, ...profileUpdates }])
          .select()
          .single();
        if (!insertError) return insertedProfile;
        lastProfileError = insertError;
        if (this.isMissingRelationError(insertError)) continue;
        throw new InternalServerErrorException(insertError.message);
      }

      const resolvedUpdateError = updateError || { message: 'Unknown error' };
      lastProfileError = resolvedUpdateError;
      if (this.isMissingRelationError(resolvedUpdateError)) continue;
      throw new InternalServerErrorException(resolvedUpdateError.message);
    }

    if (lastProfileError) {
      throw new InternalServerErrorException(lastProfileError.message);
    }

    return { user_id: normalizedUserId, ...profileUpdates };
  }
}
