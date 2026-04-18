import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class TrustService {
  private readonly trustSchemas = ['trust_and_reputation', 'trust_svc'] as const;

  constructor(private readonly supabase: SupabaseClient) {}

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
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

  private buildDateFilter(query: any, from?: string, to?: string, column = 'created_at') {
    if (from) query = query.gte(column, from);
    if (to) query = query.lte(column, to);
    return query;
  }

  private async runTrustQuery<T>(
    operation: (
      schemaName: (typeof this.trustSchemas)[number],
    ) => any,
    fallbackMessage: string,
  ): Promise<{ data: T; count?: number | null }> {
    let lastError: any = null;

    for (const schemaName of this.trustSchemas) {
      const result = (await operation(schemaName)) as {
        data: T;
        error: any;
        count?: number | null;
      };
      if (!result.error) {
        return { data: result.data, count: result.count };
      }

      lastError = result.error;
      if (!this.isMissingRelationError(result.error)) {
        throw new InternalServerErrorException(result.error.message);
      }
    }

    throw new InternalServerErrorException(
      this.toTrimmedString(lastError?.message) || fallbackMessage,
    );
  }

  async getProviderReviews(providerId: string) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) {
      throw new BadRequestException('providerId is required');
    }

    const { data: reviews } = await this.runTrustQuery<any[]>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('reviews')
          .select('id, reviewer_id, rating, review_text, created_at')
          .eq('reviewee_id', normalizedProviderId)
          .order('created_at', { ascending: false }),
      'Failed to fetch provider reviews',
    );

    return { reviews: reviews || [] };
  }

  async createReview(payload: any) {
    const bookingId = this.toTrimmedString(payload?.booking_id);
    const reviewerId = this.toTrimmedString(payload?.reviewer_id);
    const revieweeId = this.toTrimmedString(payload?.reviewee_id);
    const reviewText = this.toTrimmedString(payload?.review_text) || null;
    const rating = Number(payload?.rating);

    if (!bookingId) throw new BadRequestException('booking_id is required');
    if (!reviewerId) throw new BadRequestException('reviewer_id is required');
    if (!revieweeId) throw new BadRequestException('reviewee_id is required');
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('rating must be a number between 1 and 5');
    }

    const { data: review } = await this.runTrustQuery<any>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('reviews')
          .insert([
            {
              booking_id: bookingId,
              reviewer_id: reviewerId,
              reviewee_id: revieweeId,
              rating,
              review_text: reviewText,
            },
          ])
          .select()
          .single(),
      'Failed to create review',
    );

    const { data: allReviews } = await this.runTrustQuery<any[]>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('reviews')
          .select('rating')
          .eq('reviewee_id', revieweeId),
      'Failed to compute provider review aggregates',
    );

    const reviewRows = Array.isArray(allReviews) ? allReviews : [];
    const totalReviews = reviewRows.length;
    const averageRating = totalReviews
      ? reviewRows.reduce(
          (sum: number, row: any) => sum + Number(row?.rating || 0),
          0,
        ) / totalReviews
      : 0;

    return {
      review,
      total_reviews: totalReviews,
      average_rating: averageRating,
    };
  }

  async createProviderReport(payload: any) {
    const providerId = this.toTrimmedString(payload?.provider_id);
    const reporterId = this.toTrimmedString(payload?.reporter_id);
    const reason = this.toTrimmedString(payload?.reason);
    const details = this.toTrimmedString(payload?.details) || null;

    if (!providerId) throw new BadRequestException('provider_id is required');
    if (!reporterId) throw new BadRequestException('reporter_id is required');
    if (!reason) throw new BadRequestException('reason is required');

    const { data } = await this.runTrustQuery<any>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('provider_profile_reports')
          .insert([
            {
              reported_provider_id: providerId,
              reporter_id: reporterId,
              reason,
              description: details,
              status: 'pending',
            },
          ])
          .select()
          .single(),
      'Failed to create provider report',
    );

    return data;
  }

  async getAllReviews(page = 1, limit = 20) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, count } = await this.runTrustQuery<any[]>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('reviews')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + normalizedLimit - 1),
      'Failed to fetch reviews',
    );

    return {
      reviews: data || [],
      total: Number(count || 0),
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async deleteReview(id: string) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const { data } = await this.runTrustQuery<any[]>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('reviews')
          .delete()
          .eq('id', normalizedId)
          .select('id'),
      'Failed to delete review',
    );

    if (!Array.isArray(data) || data.length === 0) {
      throw new NotFoundException(`Review ${normalizedId} not found`);
    }
    return { ok: true };
  }

  async getPerformanceReport(from?: string, to?: string) {
    const { data } = await this.runTrustQuery<any[]>(
      (schemaName) => {
        let query = this.supabase
          .schema(schemaName)
          .from('reviews')
          .select('reviewee_id, rating, created_at');
        query = this.buildDateFilter(query, from, to);
        return query;
      },
      'Failed to fetch trust performance report',
    );

    return { reviews: data || [] };
  }

  async getComplianceReport(from?: string, to?: string) {
    const { data } = await this.runTrustQuery<any[]>(
      (schemaName) => {
        let query = this.supabase
          .schema(schemaName)
          .from('provider_profile_reports')
          .select('*');
        query = this.buildDateFilter(query, from, to);
        return query;
      },
      'Failed to fetch trust compliance report',
    );

    return { provider_reports: data || [] };
  }
}

