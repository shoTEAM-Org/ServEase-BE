import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class ServicesService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getAllServices() {
    const { data: services, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('id, title, price, description, category_id, provider_id');
    if (error) throw new InternalServerErrorException(error.message);

    // Cross-schema joins not supported — fetch categories and profiles separately
    const categoryIds = [...new Set((services || []).map((s: any) => s.category_id))];
    const providerIds = [...new Set((services || []).map((s: any) => s.provider_id))];

    const [{ data: categories }, { data: profiles }] = await Promise.all([
      this.supabase.schema('provider_catalog').from('service_categories')
        .select('id, name, slug').in('id', categoryIds),
      this.supabase.schema('provider_catalog').from('provider_profiles')
        .select('user_id, business_name, trust_score, verification_status').in('user_id', providerIds),
    ]);

    const categoryMap = Object.fromEntries((categories || []).map((c: any) => [c.id, c]));
    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    const data = (services || [])
      .filter((s: any) => profileMap[s.provider_id]?.verification_status === 'approved')
      .map((s: any) => ({
        ...s,
        service_categories: categoryMap[s.category_id] || null,
        provider_profiles: profileMap[s.provider_id] || null,
      }));

    return { success: true, data };
  }

  async searchServices(keyword?: string) {
    const { data: services, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('id, title, price, description, category_id, provider_id');
    if (error) throw new InternalServerErrorException(error.message);

    const categoryIds = [...new Set((services || []).map((s: any) => s.category_id))];
    const providerIds = [...new Set((services || []).map((s: any) => s.provider_id))];

    const [{ data: categories }, { data: profiles }] = await Promise.all([
      this.supabase.schema('provider_catalog').from('service_categories')
        .select('id, name, slug').in('id', categoryIds),
      this.supabase.schema('provider_catalog').from('provider_profiles')
        .select('user_id, business_name, trust_score, verification_status').in('user_id', providerIds),
    ]);

    const categoryMap = Object.fromEntries((categories || []).map((c: any) => [c.id, c]));
    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    let results = (services || [])
      .filter((s: any) => profileMap[s.provider_id]?.verification_status === 'approved')
      .map((s: any) => ({
        ...s,
        service_categories: categoryMap[s.category_id] || null,
        provider_profiles: profileMap[s.provider_id] || null,
      }));

    if (keyword) {
      const lower = keyword.toLowerCase();
      results = results.filter((s: any) => s.service_categories?.name?.toLowerCase().includes(lower));
    }

    const sorted = results.sort(
      (a: any, b: any) =>
        (b.provider_profiles?.trust_score || 0) - (a.provider_profiles?.trust_score || 0),
    );

    return { status: 200, message: 'Search successful', results: sorted };
  }

  async getCategories() {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return { categories: data || [] };
  }

  async getServicesByCategory(categoryName: string) {
    const { data: category } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .select('id')
      .eq('name', categoryName)
      .single();
    if (!category) return { services: [] };
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('*')
      .eq('category_id', category.id);
    if (error) throw new InternalServerErrorException(error.message);
    return { services: data || [] };
  }

  async getProvidersByServiceName(serviceName: string) {
    const { data: services, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('id, title, price, provider_id')
      .ilike('title', `%${serviceName}%`);
    if (error) throw new InternalServerErrorException(error.message);

    const providerIds = [...new Set((services || []).map((s: any) => s.provider_id))];
    const { data: profiles } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('user_id, business_name, average_rating, verification_status')
      .in('user_id', providerIds);

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    const data = (services || [])
      .filter((s: any) => profileMap[s.provider_id]?.verification_status === 'approved')
      .map((s: any) => ({ ...s, provider_profiles: profileMap[s.provider_id] || null }));

    return { providers: data };
  }

  async getProviderServices(providerId: string) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('*')
      .eq('provider_id', providerId);
    if (error) throw new InternalServerErrorException(error.message);
    return { services: data || [] };
  }

  async getProviderProfileData(providerId: string) {
    const [{ data: profile }, { data: services }, { data: reviews }] = await Promise.all([
      this.supabase.schema('provider_catalog').from('provider_profiles')
        .select('user_id, business_name, service_description, average_rating, total_reviews, trust_score, verification_status')
        .eq('user_id', providerId).single(),
      this.supabase.schema('provider_catalog').from('provider_services')
        .select('id, title, price, description').eq('provider_id', providerId),
      this.supabase.schema('trust_and_reputation').from('reviews')
        .select('id, reviewer_id, rating, review_text, created_at')
        .eq('reviewee_id', providerId).order('created_at', { ascending: false }).limit(10),
    ]);

    return {
      profile: profile || null,
      services: services || [],
      reviews: reviews || [],
    };
  }
}
