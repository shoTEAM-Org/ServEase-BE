import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseClient) {}
  private readonly addressSchemas = ['identity_and_user', 'identity_svc'] as const;

  private toTrimmedString(value: unknown) {
    return String(value ?? '').trim();
  }

  private toNullableString(value: unknown) {
    const parsed = this.toTrimmedString(value);
    return parsed || null;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  private toBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    }
    return null;
  }

  private isSchemaMismatchError(error: any) {
    const message = this.toTrimmedString(error?.message).toLowerCase();
    if (!message) return false;
    return (
      (message.includes('column') && message.includes('does not exist')) ||
      message.includes('schema cache') ||
      message.includes('pgrst204') ||
      message.includes('pgrst200')
    );
  }

  private isMissingRelationError(error: any) {
    const code = this.toTrimmedString(error?.code).toUpperCase();
    const message = this.toTrimmedString(error?.message).toLowerCase();
    return (
      code === '42P01' ||
      ((message.includes('relation') || message.includes('schema')) &&
        message.includes('does not exist'))
    );
  }

  private isRetryableAddressInsertError(error: any) {
    const message = this.toTrimmedString(error?.message).toLowerCase();
    if (!message) return false;
    return (
      this.isSchemaMismatchError(error) ||
      this.isMissingRelationError(error) ||
      message.includes('null value in column') ||
      message.includes('violates not-null constraint') ||
      message.includes('invalid input syntax')
    );
  }

  private normalizeAddressPayload(
    source: Record<string, any>,
    options: { legacyOnly?: boolean } = {},
  ) {
    const payload: Record<string, any> = {};
    const legacyOnly = Boolean(options.legacyOnly);

    const label = this.toNullableString(source.label);
    if (label !== null) payload.label = label;

    const streetAddress = this.toNullableString(
      source.street_address ?? source.street,
    );
    if (streetAddress !== null) {
      if (legacyOnly) payload.street = streetAddress;
      else payload.street_address = streetAddress;
    }

    const city = this.toNullableString(source.city);
    if (city !== null) payload.city = city;

    const province = this.toNullableString(source.province);
    if (province !== null) payload.province = province;

    const region = this.toNullableString(source.region);
    if (region !== null) payload.region = region;

    const barangay = this.toNullableString(source.barangay);
    if (barangay !== null) payload.barangay = barangay;

    const zipCode = this.toNullableString(
      source.zip_code ?? source.postal_code,
    );
    if (zipCode !== null) {
      if (legacyOnly) payload.postal_code = zipCode;
      else payload.zip_code = zipCode;
    }

    const latitude = this.toNullableNumber(source.latitude);
    if (latitude !== null) payload.latitude = latitude;

    const longitude = this.toNullableNumber(source.longitude);
    if (longitude !== null) payload.longitude = longitude;

    const isDefault = this.toBoolean(source.is_default);
    if (isDefault !== null) payload.is_default = isDefault;

    return payload;
  }

  private buildAddressInsertPayloadCandidates(source: Record<string, any>) {
    const modernBase = this.normalizeAddressPayload(source);
    const legacyBase = this.normalizeAddressPayload(source, { legacyOnly: true });
    const providedAddressId = this.toTrimmedString(source.address_id ?? source.id);
    const generatedAddressId = providedAddressId || randomUUID();

    const applyCreateDefaults = (payload: Record<string, any>, legacyOnly: boolean) => {
      const withDefaults = { ...payload };
      if (!this.toTrimmedString(withDefaults.label)) withDefaults.label = 'Home';
      if (!this.toTrimmedString(withDefaults.city)) withDefaults.city = '';
      if (!this.toTrimmedString(withDefaults.province)) withDefaults.province = '';
      if (!this.toTrimmedString(withDefaults.region)) withDefaults.region = '';
      if (!this.toTrimmedString(withDefaults.barangay)) withDefaults.barangay = '';

      if (legacyOnly) {
        if (!this.toTrimmedString(withDefaults.postal_code)) withDefaults.postal_code = '';
      } else if (!this.toTrimmedString(withDefaults.zip_code)) {
        withDefaults.zip_code = '';
      }

      return withDefaults;
    };

    const modern = applyCreateDefaults(modernBase, false);
    const legacy = applyCreateDefaults(legacyBase, true);

    const candidates: Record<string, any>[] = [
      { ...modern, address_id: generatedAddressId },
      { ...modern, id: generatedAddressId },
      modern,
      { ...legacy, address_id: generatedAddressId },
      { ...legacy, id: generatedAddressId },
      legacy,
    ];

    const uniqueCandidates: Record<string, any>[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const cleanCandidate = Object.fromEntries(
        Object.entries(candidate).filter(([, value]) => value !== undefined),
      );
      const key = JSON.stringify(cleanCandidate);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCandidates.push(cleanCandidate);
    }

    return uniqueCandidates;
  }

  private async updateAddressByColumn(
    schemaName: (typeof this.addressSchemas)[number],
    idColumn: 'address_id' | 'id',
    addressId: string,
    userId: string,
    payload: Record<string, any>,
  ) {
    return this.supabase
      .schema(schemaName)
      .from('user_addresses')
      .update(payload)
      .eq(idColumn, addressId)
      .eq('user_id', userId)
      .select()
      .single();
  }

  private async deleteAddressByColumn(
    schemaName: (typeof this.addressSchemas)[number],
    idColumn: 'address_id' | 'id',
    addressId: string,
    userId: string,
  ) {
    return this.supabase
      .schema(schemaName)
      .from('user_addresses')
      .delete()
      .eq(idColumn, addressId)
      .eq('user_id', userId);
  }

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
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    let lastError: any = null;
    for (const schemaName of this.addressSchemas) {
      const { data, error } = await this.supabase
        .schema(schemaName)
        .from('user_addresses')
        .select('*')
        .eq('user_id', normalizedUserId);
      if (!error) return { addresses: data || [] };
      lastError = error;
      if (!this.isMissingRelationError(error)) break;
    }

    throw new InternalServerErrorException(lastError?.message || 'Failed to fetch addresses');
  }

  async addAddress(userId: string, body: Record<string, any>) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    const source = body || {};
    const normalizedStreetAddress = this.toTrimmedString(
      source.street_address ?? source.street,
    );
    if (!normalizedStreetAddress) {
      throw new BadRequestException('street_address is required');
    }

    const payloadCandidates = this.buildAddressInsertPayloadCandidates(source);
    let lastError: any = null;

    for (const schemaName of this.addressSchemas) {
      for (const payload of payloadCandidates) {
        const { data, error } = await this.supabase
          .schema(schemaName)
          .from('user_addresses')
          .insert([{ ...payload, user_id: normalizedUserId }])
          .select()
          .single();

        if (!error) return { address: data };
        lastError = error;

        if (!this.isRetryableAddressInsertError(error)) {
          console.error('[users.add-address] non-retryable insert error', {
            userId: normalizedUserId,
            schemaName,
            payloadKeys: Object.keys(payload),
            error,
          });
          throw new InternalServerErrorException(error.message);
        }
      }

      if (lastError && !this.isMissingRelationError(lastError)) {
        break;
      }
    }

    console.error('[users.add-address] failed after retries', {
      userId: normalizedUserId,
      error: lastError,
    });
    throw new InternalServerErrorException(lastError?.message || 'Failed to save address');
  }

  async updateAddress(addressId: string, userId: string, updates: Record<string, any>) {
    const normalizedAddressId = this.toTrimmedString(addressId);
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedAddressId) throw new BadRequestException('addressId is required');
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    const source = updates || {};
    let payload = this.normalizeAddressPayload(source);
    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('No valid address fields provided for update');
    }

    let data: any = null;
    let error: any = null;

    for (const schemaName of this.addressSchemas) {
      ({ data, error } = await this.updateAddressByColumn(
        schemaName,
        'address_id',
        normalizedAddressId,
        normalizedUserId,
        payload,
      ));
      if (!error) return { address: data };

      if (error && this.isSchemaMismatchError(error)) {
        payload = this.normalizeAddressPayload(source, { legacyOnly: true });
        ({ data, error } = await this.updateAddressByColumn(
          schemaName,
          'address_id',
          normalizedAddressId,
          normalizedUserId,
          payload,
        ));
        if (!error) return { address: data };
      }

      if (error && this.isSchemaMismatchError(error)) {
        payload = this.normalizeAddressPayload(source);
        ({ data, error } = await this.updateAddressByColumn(
          schemaName,
          'id',
          normalizedAddressId,
          normalizedUserId,
          payload,
        ));
        if (!error) return { address: data };
      }

      if (error && this.isSchemaMismatchError(error)) {
        payload = this.normalizeAddressPayload(source, { legacyOnly: true });
        ({ data, error } = await this.updateAddressByColumn(
          schemaName,
          'id',
          normalizedAddressId,
          normalizedUserId,
          payload,
        ));
        if (!error) return { address: data };
      }

      if (!error || !this.isMissingRelationError(error)) {
        break;
      }
    }

    if (error) throw new InternalServerErrorException(error.message);
    return { address: data };
  }

  async deleteAddress(addressId: string, userId: string) {
    const normalizedAddressId = this.toTrimmedString(addressId);
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedAddressId) throw new BadRequestException('addressId is required');
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    let error: any = null;
    for (const schemaName of this.addressSchemas) {
      ({ error } = await this.deleteAddressByColumn(
        schemaName,
        'address_id',
        normalizedAddressId,
        normalizedUserId,
      ));
      if (!error) return { ok: true };

      if (error && this.isSchemaMismatchError(error)) {
        ({ error } = await this.deleteAddressByColumn(
          schemaName,
          'id',
          normalizedAddressId,
          normalizedUserId,
        ));
        if (!error) return { ok: true };
      }

      if (!error || !this.isMissingRelationError(error)) {
        break;
      }
    }

    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true };
  }
}
