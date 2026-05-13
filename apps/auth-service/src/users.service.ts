import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseClient) {}
  private readonly addressSchemas = ['identity_and_user'] as const;

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
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

  private assignIfPresent(
    payload: Record<string, any>,
    key: string,
    value: unknown,
  ) {
    if (value !== null && value !== undefined) {
      payload[key] = value;
    }
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

    const cacheMatch = /'([^']+)' column/i.exec(message);
    if (cacheMatch?.[1]) return cacheMatch[1].trim();

    const dbMatch = /column ["']?(\w+)["']? does not exist/i.exec(message);
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
        Object.hasOwn(currentPayload, missingColumn)
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

    this.assignIfPresent(payload, 'label', this.toNullableString(source.label));

    const streetAddress = this.toNullableString(source.address_line);
    if (streetAddress !== null) {
      if (legacyOnly) payload.street = streetAddress;
      else payload.address_line = streetAddress;
    }

    this.assignIfPresent(payload, 'city', this.toNullableString(source.city));
    this.assignIfPresent(payload, 'province', this.toNullableString(source.province));
    this.assignIfPresent(payload, 'region', this.toNullableString(source.region));
    this.assignIfPresent(payload, 'barangay', this.toNullableString(source.barangay));

    const zipCode = this.toNullableString(
      source.zip_code ?? source.postal_code,
    );
    if (zipCode !== null) {
      if (legacyOnly) payload.postal_code = zipCode;
      else payload.zip_code = zipCode;
    }

    this.assignIfPresent(payload, 'latitude', this.toNullableNumber(source.latitude));
    this.assignIfPresent(payload, 'longitude', this.toNullableNumber(source.longitude));

    const isDefault = this.toBoolean(source.is_default);
    this.assignIfPresent(payload, 'is_default', isDefault);

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

  private buildAddressUpdatePayloadCandidates(source: Record<string, any>) {
    const candidates = [
      this.normalizeAddressPayload(source),
      this.normalizeAddressPayload(source, { legacyOnly: true }),
    ];

    const uniqueCandidates: Record<string, any>[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const cleanCandidate = Object.fromEntries(
        Object.entries(candidate).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(cleanCandidate).length === 0) continue;

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
    const { data, error } = await this.supabase
      .schema(schemaName)
      .from('user_addresses')
      .update(payload)
      .eq(idColumn, addressId)
      .eq('user_id', userId)
      .select();

    const rows = Array.isArray(data) ? data : [];
    return {
      data: rows[0] || null,
      error,
      rowCount: rows.length,
    };
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
      .select('id, full_name, email, contact_number, role, status, created_at')
      .eq('id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('Failed to fetch profile: ' + error.message);
    if (!data) throw new NotFoundException('User not found');
    return data;
  }

  async getUsersByRole(role: string, page = 1, limit = 20) {
    const normalizedRole = this.toTrimmedString(role).toLowerCase();
    if (!normalizedRole) throw new BadRequestException('role is required');

    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, error, count } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select(
        'id, full_name, email, contact_number, role, status, created_at',
        { count: 'exact' },
      )
      .eq('role', normalizedRole)
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);
    if (error) {
      throw new InternalServerErrorException(
        'Failed to fetch users by role: ' + error.message,
      );
    }

    return {
      users: data || [],
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async getUsersByIds(userIds: unknown) {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((id) => this.toTrimmedString(id))
          .filter(Boolean),
      ),
    );

    if (!normalizedIds.length) return { users: [] };

    const { data, error } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('id, full_name, email, contact_number, role, status, created_at')
      .in('id', normalizedIds);
    if (error) {
      throw new InternalServerErrorException(
        'Failed to fetch users by ids: ' + error.message,
      );
    }

    return { users: data || [] };
  }

  async getUserReport(from?: string, to?: string) {
    let query = this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('role, status, created_at');
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) {
      throw new InternalServerErrorException(
        'Failed to generate user report: ' + error.message,
      );
    }

    const users = data || [];
    const byRole = users.reduce((acc: Record<string, number>, user: any) => {
      const role = this.toTrimmedString(user?.role) || 'unknown';
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    const byStatus = users.reduce((acc: Record<string, number>, user: any) => {
      const status = this.toTrimmedString(user?.status) || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return { total: users.length, by_role: byRole, by_status: byStatus };
  }

  async updateProfile(userId: string, updates: Record<string, any>) {
    const allowed = ['full_name', 'contact_number'];
    const filtered: Record<string, any> = {};
    for (const key of allowed) { if (updates[key] !== undefined) filtered[key] = updates[key]; }
    const { data, error } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .update(filtered)
      .eq('id', userId)
      .select()
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('Failed to update profile: ' + error.message);
    return data;
  }

  async updateUserStatus(userId: string, status: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    const normalizedStatus = this.toTrimmedString(status).toLowerCase();
    if (!normalizedUserId) throw new BadRequestException('userId is required');
    if (!normalizedStatus) throw new BadRequestException('status is required');

    const allowedStatuses = new Set([
      'active',
      'suspended',
      'inactive',
    ]);
    if (!allowedStatuses.has(normalizedStatus)) {
      throw new BadRequestException('Invalid status value');
    }

    const { data, error } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .update({ status: normalizedStatus })
      .eq('id', normalizedUserId)
      .select('id, status')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException(
        'Failed to update user status: ' + error.message,
      );
    }
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

  async updateCustomerProfile(userId: string, updates: Record<string, any>) { // NOSONAR: Legacy fallback flow; refactor planned separately.
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
        Object.hasOwn(filtered, missingColumn)
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

  async addAddress(userId: string, body: Record<string, any>) { // NOSONAR: Legacy fallback flow; refactor planned separately.
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    const source = body || {};
    const normalizedStreetAddress = this.toTrimmedString(source.address_line);
    if (!normalizedStreetAddress) {
      throw new BadRequestException('address_line is required');
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
            Object.hasOwn(currentPayload, missingColumn)
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

  private async tryUpdateAddressCandidate( // NOSONAR: Legacy fallback flow; refactor planned separately.
    schemaName: (typeof this.addressSchemas)[number],
    idColumn: 'address_id' | 'id',
    addressId: string,
    userId: string,
    payloadCandidate: Record<string, any>,
  ) {
    let currentPayload = { ...payloadCandidate };
    let lastError: any = null;
    let hadQueryableSchema = false;

    for (let retry = 0; retry < 8; retry += 1) {
      const result = await this.updateAddressByColumn(
        schemaName,
        idColumn,
        addressId,
        userId,
        currentPayload,
      );

      if (!result.error) {
        hadQueryableSchema = true;

        if (result.data) {
          if (result.rowCount > 1) {
            console.warn('[users.update-address] multiple rows updated', {
              userId,
              addressId,
              schemaName,
              idColumn,
              rowCount: result.rowCount,
            });
          }

          return {
            address: result.data,
            schemaMissingRelation: false,
            hadQueryableSchema,
            lastError,
          };
        }

        return {
          address: null,
          schemaMissingRelation: false,
          hadQueryableSchema,
          lastError,
        };
      }

      lastError = result.error;

      const missingColumn = this.extractMissingColumnName(result.error);
      if (missingColumn && Object.hasOwn(currentPayload, missingColumn)) {
        const { [missingColumn]: _removed, ...nextPayload } = currentPayload;
        if (Object.keys(nextPayload).length === 0) {
          return {
            address: null,
            schemaMissingRelation: false,
            hadQueryableSchema,
            lastError,
          };
        }
        currentPayload = nextPayload;
        continue;
      }

      if (this.isMissingRelationError(result.error)) {
        return {
          address: null,
          schemaMissingRelation: true,
          hadQueryableSchema,
          lastError,
        };
      }

      if (this.isSchemaMismatchError(result.error)) {
        return {
          address: null,
          schemaMissingRelation: false,
          hadQueryableSchema,
          lastError,
        };
      }

      console.error('[users.update-address] non-retryable update error', {
        userId,
        addressId,
        schemaName,
        idColumn,
        payloadKeys: Object.keys(currentPayload),
        error: result.error,
      });
      throw new InternalServerErrorException(result.error.message);
    }

    return {
      address: null,
      schemaMissingRelation: false,
      hadQueryableSchema,
      lastError,
    };
  }

  async updateAddress(addressId: string, userId: string, updates: Record<string, any>) { // NOSONAR: Legacy fallback flow; refactor planned separately.
    const normalizedAddressId = this.toTrimmedString(addressId);
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedAddressId) throw new BadRequestException('addressId is required');
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    const source = updates || {};
    const payloadCandidates = this.buildAddressUpdatePayloadCandidates(source);
    if (!payloadCandidates.length) {
      throw new BadRequestException('No valid address fields provided for update');
    }

    const idColumns: Array<'address_id' | 'id'> = ['address_id', 'id'];
    let lastError: any = null;
    let hadQueryableSchema = false;

    for (const schemaName of this.addressSchemas) {
      let schemaMissingRelation = false;

      for (const idColumn of idColumns) {
        for (const payloadCandidate of payloadCandidates) {
          const result = await this.tryUpdateAddressCandidate(
            schemaName,
            idColumn,
            normalizedAddressId,
            normalizedUserId,
            payloadCandidate,
          );

          if (result.address) {
            return { address: result.address };
          }

          if (result.hadQueryableSchema) {
            hadQueryableSchema = true;
          }

          if (result.lastError) {
            lastError = result.lastError;
          }

          if (result.schemaMissingRelation) {
            schemaMissingRelation = true;
            break;
          }
        }

        if (schemaMissingRelation) break;
      }

      if (schemaMissingRelation) {
        continue;
      }
    }

    if (hadQueryableSchema) {
      throw new NotFoundException('Address not found');
    }

    throw new InternalServerErrorException(
      lastError?.message || 'Failed to update address',
    );
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
