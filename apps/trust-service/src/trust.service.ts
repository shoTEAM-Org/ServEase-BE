import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka, RpcException } from '@nestjs/microservices';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  NOTIFICATION_PATTERNS,
  TRUST_PATTERNS,
  connectKafkaClientWithRetry,
} from '@app/common';

@Injectable()
export class TrustService implements OnModuleInit {
  private readonly trustSchemas = ['trust_and_reputation'] as const;

  constructor(
    private readonly supabase: SupabaseClient,
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
  ) {}

  async onModuleInit() {
    await connectKafkaClientWithRetry(this.kafka, {
      context: TrustService.name,
    });
  }

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private emitReviewNotification(revieweeId: string, metadata: any = {}) {
    try {
      this.kafka.emit(NOTIFICATION_PATTERNS.REVIEW_CREATED, {
        userId: revieweeId,
        type: NOTIFICATION_PATTERNS.REVIEW_CREATED,
        metadata,
      });
    } catch (error) {
      // Silently fail, notifications are non-critical
    }
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

  private isUniqueViolationError(error: any) {
    const code = this.toTrimmedString(error?.code).toUpperCase();
    return code === '23505';
  }

  private reviewConflict(message = 'A review already exists for this booking') {
    return new RpcException({
      statusCode: HttpStatus.CONFLICT,
      message,
    });
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
        if (this.isUniqueViolationError(result.error)) {
          throw this.reviewConflict(
            this.toTrimmedString(result.error.message) ||
              'A matching trust record already exists',
          );
        }
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

    const { data: existingReviews } = await this.runTrustQuery<any[]>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('reviews')
          .select('id')
          .eq('booking_id', bookingId)
          .eq('reviewer_id', reviewerId)
          .limit(1),
      'Failed to check existing review',
    );
    if (Array.isArray(existingReviews) && existingReviews.length > 0) {
      throw this.reviewConflict();
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

    // Emit notification for review creation
    this.emitReviewNotification(revieweeId, {
      bookingId,
      reviewerId,
      rating,
      totalReviews,
      averageRating,
    });

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
              booking_id: this.toTrimmedString(payload?.booking_id) || null,
              reporter_id: reporterId,
              provider_id: providerId,
              reason,
              details,
              status: 'open',
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

  // ==================== Review Responses ====================

  private emitReviewResponseNotification(
    reviewerId: string,
    metadata: any = {},
    eventType: string,
  ) {
    try {
      this.kafka.emit(eventType, {
        userId: reviewerId,
        type: eventType,
        metadata,
      });
    } catch (error) {
      // Silently fail, notifications are non-critical
    }
  }

  async createReviewResponse(payload: any) {
    const reviewId = this.toTrimmedString(payload?.review_id);
    const responderId = this.toTrimmedString(payload?.responder_id);
    const responseText = this.toTrimmedString(payload?.response_text);

    if (!reviewId) throw new BadRequestException('review_id is required');
    if (!responderId) throw new BadRequestException('responder_id is required');
    if (!responseText) throw new BadRequestException('response_text is required');
    if (responseText.length > 1000) {
      throw new BadRequestException('response_text must be 1000 characters or less');
    }

    // Verify the review exists and get reviewee_id to check authorization
    const { data: review } = await this.runTrustQuery<any>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('reviews')
          .select('id, reviewee_id, reviewer_id')
          .eq('id', reviewId)
          .single(),
      'Failed to fetch review',
    );

    if (!review) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    // Only the reviewee (provider) can respond to a review
    if (review.reviewee_id !== responderId) {
      throw new ForbiddenException('Only the reviewee can respond to this review');
    }

    // Check if response already exists
    const { data: existingResponse } = await this.runTrustQuery<any[]>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('review_responses')
          .select('id')
          .eq('review_id', reviewId)
          .limit(1),
      'Failed to check existing response',
    );

    if (Array.isArray(existingResponse) && existingResponse.length > 0) {
      throw new RpcException({
        statusCode: HttpStatus.CONFLICT,
        message: 'A response already exists for this review',
      });
    }

    // Create the response
    const { data: response } = await this.runTrustQuery<any>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('review_responses')
          .insert([
            {
              review_id: reviewId,
              responder_id: responderId,
              response_text: responseText,
            },
          ])
          .select()
          .single(),
      'Failed to create review response',
    );

    // Notify the reviewer
    this.emitReviewResponseNotification(review.reviewer_id, {
      reviewId,
      responseId: response?.id,
      responderId,
    }, NOTIFICATION_PATTERNS.REVIEW_RESPONSE_CREATED);

    return { response };
  }

  async updateReviewResponse(payload: any) {
    const reviewId = this.toTrimmedString(payload?.review_id);
    const responderId = this.toTrimmedString(payload?.responder_id);
    const responseText = this.toTrimmedString(payload?.response_text);

    if (!reviewId) throw new BadRequestException('review_id is required');
    if (!responderId) throw new BadRequestException('responder_id is required');
    if (!responseText) throw new BadRequestException('response_text is required');
    if (responseText.length > 1000) {
      throw new BadRequestException('response_text must be 1000 characters or less');
    }

    // Get existing response
    const { data: existingResponse } = await this.runTrustQuery<any>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('review_responses')
          .select('id, responder_id, review_id')
          .eq('review_id', reviewId)
          .single(),
      'Failed to fetch existing response',
    );

    if (!existingResponse) {
      throw new NotFoundException('Response not found for this review');
    }

    // Only the original responder can update
    if (existingResponse.responder_id !== responderId) {
      throw new ForbiddenException('Only the original responder can update this response');
    }

    // Update the response
    const { data: response } = await this.runTrustQuery<any>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('review_responses')
          .update({ response_text: responseText })
          .eq('id', existingResponse.id)
          .select()
          .single(),
      'Failed to update review response',
    );

    // Get reviewer_id for notification
    const { data: review } = await this.runTrustQuery<any>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('reviews')
          .select('reviewer_id')
          .eq('id', reviewId)
          .single(),
      'Failed to fetch review',
    );

    // Notify the reviewer
    if (review?.reviewer_id) {
      this.emitReviewResponseNotification(review.reviewer_id, {
        reviewId,
        responseId: response?.id,
      }, NOTIFICATION_PATTERNS.REVIEW_RESPONSE_UPDATED);
    }

    return { response };
  }

  async getReviewWithResponse(reviewId: string) {
    const normalizedReviewId = this.toTrimmedString(reviewId);
    if (!normalizedReviewId) {
      throw new BadRequestException('reviewId is required');
    }

    // Get the review
    const { data: review } = await this.runTrustQuery<any>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('reviews')
          .select('id, booking_id, reviewer_id, reviewee_id, rating, review_text, created_at')
          .eq('id', normalizedReviewId)
          .single(),
      'Failed to fetch review',
    );

    if (!review) {
      throw new NotFoundException(`Review ${normalizedReviewId} not found`);
    }

    // Get the response if it exists
    const { data: response } = await this.runTrustQuery<any>(
      (schemaName) =>
        this.supabase
          .schema(schemaName)
          .from('review_responses')
          .select('id, responder_id, response_text, created_at, updated_at')
          .eq('review_id', normalizedReviewId)
          .maybeSingle(),
      'Failed to fetch response',
    );

    return {
      ...review,
      response: response || null,
    };
  }
}

