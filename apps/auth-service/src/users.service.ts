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

  private extractMissingColumnName(error: any): string | null {
    const message = this.toTrimmedString(error?.message);
    if (!message) return null;

    const cacheMatch = message.match(/'([^']+)' column/i);
    if (cacheMatch?.[1]) return cacheMatch[1].trim();

    const dbMatch = message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i);
    if (dbMatch?.[1]) return dbMatch[1].trim();

    return null;
  }

  private async getUserProfileSeed(userId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) return null;

    for (const schemaName of this.addressSchemas) {
      const { data, error } = await this.supabase
        .schema(schemaName)
        .from('users')
        .select('id, full_name, email, contact_number')
        .eq('id', normalizedUserId)
        .maybeSingle();
      if (!error) return data;
      if (!this.isMissingRelationError(error)) break;
    }

    return null;
  }

  private async insertCustomerProfileWithFallback(
    schemaName: (typeof this.addressSchemas)[number],
    userId: string,
    payload: Record<string, any>,
  ) {
    const userSeed = await this.getUserProfileSeed(userId);
    let currentPayload = { ...payload };
    const seededFullName = this.toNullableString(userSeed?.full_name);
    if (seededFullName && currentPayload.full_name === undefined) {
      currentPayload.full_name = seededFullName;
    }

    let lastError: any = null;
    for (let retry = 0; retry < 10; retry += 1) {
      const { data, error } = await this.supabase
        .schema(schemaName)
        .from('customer_profiles')
        .insert([currentPayload])
        .select()
        .single();
      if (!error) return { data, error: null };
      lastError = error;

      const missingColumn = this.extractMissingColumnName(error);
      if (
        missingColumn &&
        Object.prototype.hasOwnProperty.call(currentPayload, missingColumn)
      ) {
        const nextPayload = { ...currentPayload };
        delete nextPayload[missingColumn];
        currentPayload = nextPayload;
        continue;
      }

      const message = this.toTrimmedString(error?.message).toLowerCase();
      if (
        message.includes('null value in column') &&
        !this.toTrimmedString(currentPayload.full_name)
      ) {
        const retrySeed = await this.getUserProfileSeed(userId);
        const retrySeedName = this.toNullableString(retrySeed?.full_name);
        if (retrySeedName) {
          currentPayload = { ...currentPayload, full_name: retrySeedName };
          continue;
        }
      }

      break;
    }

    return { data: null, error: lastError };
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

    const modern = { ...modernBase };
    const legacy = { ...legacyBase };

    if (!this.toTrimmedString(modern.label)) modern.label = 'Home';
    if (!this.toTrimmedString(legacy.label)) legacy.label = 'Home';

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
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    let lastError: any = null;
    for (const schemaName of this.addressSchemas) {
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

    if (lastError && !this.isMissingRelationError(lastError)) {
      throw new InternalServerErrorException(lastError.message);
    }
    return { user_id: normalizedUserId };
  }

  async updateCustomerProfile(userId: string, updates: Record<string, any>) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    const allowed = [
      'full_name',
      'address',
      'city',
      'province',
      'region',
      'barangay',
      'zip_code',
      'postal_code',
      'landmark',
    ];
    let filtered: Record<string, any> = {};
    for (const key of allowed) {
      if (updates?.[key] !== undefined) filtered[key] = updates[key];
    }

    if (Object.keys(filtered).length === 0) {
      throw new BadRequestException('No valid customer profile fields provided');
    }

    let lastError: any = null;
    for (const schemaName of this.addressSchemas) {
      const { data: updatedRow, error: updateError } = await this.supabase
        .schema(schemaName)
        .from('customer_profiles')
        .update(filtered)
        .eq('user_id', normalizedUserId)
        .select()
        .maybeSingle();

      if (!updateError && updatedRow) return updatedRow;
      if (!updateError && !updatedRow) {
        const { data: insertedRow, error: insertError } =
          await this.insertCustomerProfileWithFallback(
            schemaName,
            normalizedUserId,
            { user_id: normalizedUserId, ...filtered },
          );
        if (!insertError) return insertedRow;
        lastError = insertError;
        if (
          this.isMissingRelationError(insertError) ||
          this.isSchemaMismatchError(insertError)
        ) {
          continue;
        }
        throw new InternalServerErrorException('Failed to update customer profile: ' + insertError.message);
      }

      const missingColumn = this.extractMissingColumnName(updateError);
      if (
        missingColumn &&
        Object.prototype.hasOwnProperty.call(filtered, missingColumn)
      ) {
        const nextFiltered = { ...filtered };
        delete nextFiltered[missingColumn];
        filtered = nextFiltered;

        if (Object.keys(filtered).length === 0) {
          return { user_id: normalizedUserId };
        }

        const { data: retriedUpdatedRow, error: retriedUpdateError } =
          await this.supabase
            .schema(schemaName)
            .from('customer_profiles')
            .update(filtered)
            .eq('user_id', normalizedUserId)
            .select()
            .maybeSingle();

        if (!retriedUpdateError && retriedUpdatedRow) return retriedUpdatedRow;
        if (!retriedUpdateError && !retriedUpdatedRow) {
          const { data: insertedRow, error: insertError } =
            await this.insertCustomerProfileWithFallback(
              schemaName,
              normalizedUserId,
              { user_id: normalizedUserId, ...filtered },
            );
          if (!insertError) return insertedRow;
          lastError = insertError;
          if (
            this.isMissingRelationError(insertError) ||
            this.isSchemaMismatchError(insertError)
          ) {
            continue;
          }
          throw new InternalServerErrorException(
            'Failed to update customer profile: ' + insertError.message,
          );
        }

        lastError = retriedUpdateError;
        if (retriedUpdateError) {
          if (
            this.isMissingRelationError(retriedUpdateError) ||
            this.isSchemaMismatchError(retriedUpdateError)
          ) {
            continue;
          }
          throw new InternalServerErrorException(
            'Failed to update customer profile: ' + retriedUpdateError.message,
          );
        }
      }

      const resolvedUpdateError = updateError || { message: 'Unknown error' };
      lastError = resolvedUpdateError;
      if (
        this.isMissingRelationError(resolvedUpdateError) ||
        this.isSchemaMismatchError(resolvedUpdateError)
      ) {
        continue;
      }
      throw new InternalServerErrorException('Failed to update customer profile: ' + resolvedUpdateError.message);     
    }

    throw new InternalServerErrorException(
      'Failed to update customer profile: ' + (lastError?.message || 'Unknown error'),
    );
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
        let currentPayload = { ...payload };
        let shouldMoveToNextPayload = false;

        for (let retry = 0; retry < 8; retry += 1) {
          const { data, error } = await this.supabase
            .schema(schemaName)
            .from('user_addresses')
            .insert([{ ...currentPayload, user_id: normalizedUserId }])
            .select()
            .single();

          if (!error) return { address: data };
          lastError = error;

          const missingColumn = this.extractMissingColumnName(error);
          if (
            missingColumn &&
            Object.prototype.hasOwnProperty.call(currentPayload, missingColumn)
          ) {
            const { [missingColumn]: _removed, ...nextPayload } = currentPayload;
            currentPayload = nextPayload;
            continue;
          }

          if (!this.isRetryableAddressInsertError(error)) {
            console.error('[users.add-address] non-retryable insert error', {
              userId: normalizedUserId,
              schemaName,
              payloadKeys: Object.keys(currentPayload),
              error,
            });
            throw new InternalServerErrorException(error.message);
          }

          shouldMoveToNextPayload = true;
          break;
        }

        if (shouldMoveToNextPayload) {
          continue;
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
