import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getProfile(userId: string) {
    const { data, error } = await this.supabase.schema('identity_and_user').from('users')
      .select('id, full_name, email, contact_number, role, status, date_of_birth, created_at')
      .eq('id', userId).single();
    if (error) throw new InternalServerErrorException('Failed to fetch profile: ' + error.message);
    if (!data) throw new NotFoundException('User not found');
    return data;
  }

  async updateProfile(userId: string, updates: Record<string, any>) {
    const allowed = ['full_name', 'contact_number', 'date_of_birth'];
    const filtered: Record<string, any> = {};
    for (const key of allowed) { if (updates[key] !== undefined) filtered[key] = updates[key]; }
    const { data, error } = await this.supabase.schema('identity_and_user').from('users').update(filtered).eq('id', userId).select().single();
    if (error) throw new InternalServerErrorException('Failed to update profile: ' + error.message);
    return data;
  }

  async getCustomerProfile(userId: string) {
    const { data, error } = await this.supabase.schema('identity_and_user').from('customer_profiles').select('*').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') throw new InternalServerErrorException(error.message);
    return data || { user_id: userId };
  }

  async updateCustomerProfile(userId: string, updates: Record<string, any>) {
    const { data, error } = await this.supabase.schema('identity_and_user').from('customer_profiles').update(updates).eq('user_id', userId).select().single();
    if (error) throw new InternalServerErrorException('Failed to update customer profile: ' + error.message);
    return data;
  }

  async getAddresses(userId: string) {
    const { data, error } = await this.supabase.schema('identity_and_user').from('user_addresses').select('*').eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
    return { addresses: data || [] };
  }

  async addAddress(userId: string, body: Record<string, any>) {
    const { data, error } = await this.supabase.schema('identity_and_user').from('user_addresses').insert([{ ...body, user_id: userId }]).select().single();
    if (error) throw new InternalServerErrorException(error.message);
    return { address: data };
  }

  async updateAddress(addressId: string, userId: string, updates: Record<string, any>) {
    const { data, error } = await this.supabase.schema('identity_and_user').from('user_addresses').update(updates).eq('address_id', addressId).eq('user_id', userId).select().single();
    if (error) throw new InternalServerErrorException(error.message);
    return { address: data };
  }

  async deleteAddress(addressId: string, userId: string) {
    const { error } = await this.supabase.schema('identity_and_user').from('user_addresses').delete().eq('address_id', addressId).eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true };
  }
}
