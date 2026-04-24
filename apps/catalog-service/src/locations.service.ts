import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class LocationsService {
  private readonly locationSchemas = [
    'provider_catalog',
  ] as const;

  constructor(private readonly supabase: SupabaseClient) {}

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private isSchemaOrRelationMissing(error: any) {
    const code = this.toTrimmedString(error?.code).toUpperCase();
    const message = this.toTrimmedString(error?.message).toLowerCase();
    return (
      code === '3F000' ||
      code === '42P01' ||
      code === 'PGRST106' ||
      code === 'PGRST205' ||
      ((message.includes('schema') || message.includes('relation')) &&
        message.includes('does not exist'))
    );
  }

  private async runLocationQuery<T>(
    tableCandidates: readonly string[],
    operation: (
      schemaName: (typeof this.locationSchemas)[number],
      tableName: string,
    ) => any,
    fallbackMessage: string,
  ): Promise<T> {
    let lastError: any = null;

    for (const schemaName of this.locationSchemas) {
      for (const tableName of tableCandidates) {
        const result = (await operation(schemaName, tableName)) as {
          data: T;
          error: any;
        };
        if (!result.error) {
          return result.data;
        }

        lastError = result.error;
        if (!this.isSchemaOrRelationMissing(result.error)) {
          throw new InternalServerErrorException(result.error.message);
        }
      }
    }

    throw new InternalServerErrorException(
      this.toTrimmedString(lastError?.message) || fallbackMessage,
    );
  }

  async getLocations() {
    const data = await this.runLocationQuery<any[]>(
      ['location', 'locations'],
      (schemaName, tableName) =>
        this.supabase.schema(schemaName).from(tableName).select('*'),
      'Failed to fetch locations',
    );
    return { data: data || [] };
  }

  async getProvinces() {
    const data = await this.runLocationQuery<any[]>(
      ['psgc_provinces'],
      (schemaName, tableName) =>
        this.supabase
          .schema(schemaName)
          .from(tableName)
          .select('code, name')
          .order('name', { ascending: true }),
      'Failed to fetch provinces',
    );
    return data || [];
  }

  async getCities(provinceCode: string) {
    const data = await this.runLocationQuery<any[]>(
      ['psgc_cities'],
      (schemaName, tableName) =>
        this.supabase
          .schema(schemaName)
          .from(tableName)
          .select('code, name')
          .eq('province_code', provinceCode)
          .order('name', { ascending: true }),
      'Failed to fetch cities',
    );
    return data || [];
  }

  async getBarangays(cityCode: string) {
    const data = await this.runLocationQuery<any[]>(
      ['psgc_barangays'],
      (schemaName, tableName) =>
        this.supabase
          .schema(schemaName)
          .from(tableName)
          .select('code, name')
          .eq('city_code', cityCode)
          .order('name', { ascending: true }),
      'Failed to fetch barangays',
    );
    return data || [];
  }
}
