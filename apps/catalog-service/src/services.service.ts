import {
  Inject,
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  PROVIDER_PATTERNS,
  connectKafkaClientWithRetry,
  sendKafkaRpcRequest,
} from '@app/common';

@Injectable()
export class ServicesService implements OnModuleInit {
  constructor(
    private readonly supabase: SupabaseClient,
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
  ) {}

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_BY_SERVICE);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.SEARCH);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_PROFILE);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_MY_SERVICES);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_REVIEWS);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_ADMIN_SERVICES);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.UPDATE_ADMIN_SERVICE);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.DELETE_ADMIN_SERVICE);
    await connectKafkaClientWithRetry(this.kafka, {
      context: ServicesService.name,
    });
  }

  private async request<T = any>(pattern: string, payload: unknown): Promise<T> {
    return await sendKafkaRpcRequest(
      () => this.kafka.send<T, unknown>(pattern, payload),
      { context: pattern },
    );
  }

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private async getProviderProfilesByIds(userIds: unknown) {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((userId) => this.toTrimmedString(userId))
          .filter(Boolean),
      ),
    );
    if (!normalizedIds.length) return [] as any[];

    const response = await this.request<any>(
      PROVIDER_PATTERNS.GET_PROFILES_BY_IDS,
      { userIds: normalizedIds },
    ).catch(() => ({ profiles: [] }));

    const profiles =
      response && typeof response === 'object' && 'profiles' in response
        ? response.profiles
        : [];
    return Array.isArray(profiles) ? profiles : [];
  }

  private async searchProviderServices(searchTerm = '') {
    const response = await this.request<any>(PROVIDER_PATTERNS.SEARCH, {
      searchTerm: this.toTrimmedString(searchTerm),
    }).catch(() => ({ data: [] }));

    const data =
      response && typeof response === 'object' && 'data' in response
        ? response.data
        : [];
    return Array.isArray(data) ? data : [];
  }

  async getAllServices() {
    const services = await this.searchProviderServices('');

    const categoryIds = [...new Set((services || []).map((s: any) => s.service_id))];

    const { data: categories } = categoryIds.length
      ? await this.supabase
          .schema('provider_catalog')
          .from('service_categories')
          .select('id, name, slug')
          .in('id', categoryIds)
      : { data: [] as any[] };

    const categoryMap = Object.fromEntries((categories || []).map((c: any) => [c.id, c]));

    const data = (services || [])
      .filter(
        (s: any) =>
          this.toTrimmedString(s?.provider_profiles?.verification_status) ===
          'approved',
      )
      .map((s: any) => ({
        ...s,
        service_categories: categoryMap[s.service_id] || null,
        provider_profiles: s.provider_profiles || null,
      }));

    return { success: true, data };
  }

  async searchServices(keyword?: string) {
    const services = await this.searchProviderServices('');

    const categoryIds = [...new Set((services || []).map((s: any) => s.service_id))];

    const { data: categories } = categoryIds.length
      ? await this.supabase
          .schema('provider_catalog')
          .from('service_categories')
          .select('id, name, slug')
          .in('id', categoryIds)
      : { data: [] as any[] };

    const categoryMap = Object.fromEntries((categories || []).map((c: any) => [c.id, c]));

    let results = (services || [])
      .filter(
        (s: any) =>
          this.toTrimmedString(s?.provider_profiles?.verification_status) ===
          'approved',
      )
      .map((s: any) => ({
        ...s,
        service_categories: categoryMap[s.service_id] || null,
        provider_profiles: s.provider_profiles || null,
      }));

    if (keyword) {
      const lower = keyword.toLowerCase();
      results = results.filter((s: any) => s.service_categories?.name?.toLowerCase().includes(lower));
    }

    const sorted = [...results];
    sorted.sort(
      (a: any, b: any) =>
        (b.provider_profiles?.trust_score || 0) -
        (a.provider_profiles?.trust_score || 0),
    );

    return { status: 200, message: 'Search successful', results: sorted };
  }

  async getCategories() {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .select('id, name, slug, display_order, is_active')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
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

    const response = await this.request<any>(PROVIDER_PATTERNS.GET_BY_SERVICE, {
      serviceId: category.id,
    }).catch(() => ({ data: [] }));
    const services =
      response && typeof response === 'object' && 'data' in response
        ? response.data
        : [];
    return { services: Array.isArray(services) ? services : [] };
  }

  async getProvidersByServiceName(serviceName: string) {
    const normalizedName = this.toTrimmedString(serviceName).toLowerCase();
    const services = await this.searchProviderServices(normalizedName);
    const data = services
      .filter((service: any) =>
        this.toTrimmedString(service?.title)
          .toLowerCase()
          .includes(normalizedName),
      )
      .filter(
        (service: any) =>
          this.toTrimmedString(service?.provider_profiles?.verification_status) ===
          'approved',
      );

    return { providers: data };
  }

  async getProviderServices(providerId: string) {
    const response = await this.request<any>(PROVIDER_PATTERNS.GET_MY_SERVICES, {
      providerId,
    });
    const services =
      response && typeof response === 'object' && 'services' in response
        ? response.services
        : [];
    return { services: Array.isArray(services) ? services : [] };
  }

  async getProviderProfileData(providerId: string) {
    const [profileResponse, servicesResponse, reviewsResponse] = await Promise.all([
      this.request<any>(PROVIDER_PATTERNS.GET_PROFILE, { userId: providerId }).catch(
        () => null,
      ),
      this.request<any>(PROVIDER_PATTERNS.GET_MY_SERVICES, { providerId }).catch(
        () => ({ services: [] }),
      ),
      this.request<any>(PROVIDER_PATTERNS.GET_REVIEWS, { providerId }).catch(
        () => ({ data: { reviews: [] } }),
      ),
    ]);

    const profile =
      profileResponse &&
      typeof profileResponse === 'object' &&
      'data' in profileResponse
        ? profileResponse.data
        : null;

    const serviceRows =
      servicesResponse &&
      typeof servicesResponse === 'object' &&
      'services' in servicesResponse &&
      Array.isArray(servicesResponse.services)
        ? servicesResponse.services
        : [];

    const services = serviceRows.map((service: any) => ({
      id: service?.id,
      title: service?.title,
      price: service?.price,
      description: service?.description,
    }));

    const reviews = Array.isArray(reviewsResponse?.data?.reviews)
      ? reviewsResponse.data.reviews
      : [];

    return {
      profile: profile || null,
      services: services || [],
      reviews,
    };
  }

  async getCategoriesAdmin(page = 1, limit = 100) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 100;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, error, count } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return {
      categories: data || [],
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async createCategoryAdmin(body: any) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .insert([body])
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return { category: data };
  }

  async updateCategoryAdmin(id: string, body: any) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .update(body)
      .eq('id', normalizedId)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Category ${normalizedId} not found`);
    }
    return { ok: true };
  }

  async deleteCategoryAdmin(id: string) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .delete()
      .eq('id', normalizedId)
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Category ${normalizedId} not found`);
    }
    return { ok: true };
  }

  async getAllServicesAdmin(page = 1, limit = 20) {
    return await this.request<any>(PROVIDER_PATTERNS.GET_ADMIN_SERVICES, {
      page,
      limit,
    });
  }

  async updateServiceAdmin(id: string, body: any) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    return await this.request<any>(PROVIDER_PATTERNS.UPDATE_ADMIN_SERVICE, {
      id: normalizedId,
      body,
    });
  }

  async deleteServiceAdmin(id: string) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    return await this.request<any>(PROVIDER_PATTERNS.DELETE_ADMIN_SERVICE, {
      id: normalizedId,
    });
  }

  async getServiceAreasAdmin() {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('location')
      .select('*');
    if (error) throw new InternalServerErrorException(error.message);
    return { areas: data || [] };
  }

  async createServiceAreaAdmin(body: any) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('location')
      .insert([body])
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return { area: data };
  }

  async updateServiceAreaAdmin(id: string, body: any) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('location')
      .update(body)
      .eq('id', normalizedId)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Service area ${normalizedId} not found`);
    }
    return { ok: true };
  }

  async deleteServiceAreaAdmin(id: string) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('location')
      .delete()
      .eq('id', normalizedId)
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Service area ${normalizedId} not found`);
    }
    return { ok: true };
  }
}
