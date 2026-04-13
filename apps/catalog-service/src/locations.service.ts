import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class LocationsService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getLocations() {
    const { data, error } = await this.supabase.from('locations').select('*');
    if (error) throw new InternalServerErrorException(error.message);
    return { data: data || [] };
  }

  async getProvinces() {
    const { data, error } = await this.supabase.from('psgc_provinces')
      .select('code, name').order('name', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return data || [];
  }

  async getCities(provinceCode: string) {
    const { data, error } = await this.supabase.from('psgc_cities')
      .select('code, name').eq('province_code', provinceCode).order('name', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return data || [];
  }

  async getBarangays(cityCode: string) {
    const { data, error } = await this.supabase.from('psgc_barangays')
      .select('code, name').eq('city_code', cityCode).order('name', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return data || [];
  }
}
