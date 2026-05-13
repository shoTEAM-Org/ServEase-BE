import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { TRUST_PATTERNS } from '@app/common';
import { TrustService } from './trust.service.js';

@Controller()
export class TrustKafkaController {
  constructor(@Inject(TrustService) private readonly trustService: TrustService) {}

  @MessagePattern(TRUST_PATTERNS.GET_PROVIDER_REVIEWS)
  async getProviderReviews(@Payload() data: any) {
    return this.trustService.getProviderReviews(data?.providerId);
  }

  @MessagePattern(TRUST_PATTERNS.CREATE_REVIEW)
  async createReview(@Payload() data: any) {
    return this.trustService.createReview(data);
  }

  @MessagePattern(TRUST_PATTERNS.CREATE_PROVIDER_REPORT)
  async createProviderReport(@Payload() data: any) {
    return this.trustService.createProviderReport(data);
  }

  @MessagePattern(TRUST_PATTERNS.GET_ALL_REVIEWS)
  async getAllReviews(@Payload() data: any) {
    return this.trustService.getAllReviews(data?.page, data?.limit);
  }

  @MessagePattern(TRUST_PATTERNS.DELETE_REVIEW)
  async deleteReview(@Payload() data: any) {
    return this.trustService.deleteReview(data?.id);
  }

  @MessagePattern(TRUST_PATTERNS.GET_PERFORMANCE_REPORT)
  async getPerformanceReport(@Payload() data: any) {
    return this.trustService.getPerformanceReport(data?.from, data?.to);
  }

  @MessagePattern(TRUST_PATTERNS.GET_COMPLIANCE_REPORT)
  async getComplianceReport(@Payload() data: any) {
    return this.trustService.getComplianceReport(data?.from, data?.to);
  }

  // Review Response handlers
  @MessagePattern(TRUST_PATTERNS.CREATE_REVIEW_RESPONSE)
  async createReviewResponse(@Payload() data: any) {
    return this.trustService.createReviewResponse(data);
  }

  @MessagePattern(TRUST_PATTERNS.UPDATE_REVIEW_RESPONSE)
  async updateReviewResponse(@Payload() data: any) {
    return this.trustService.updateReviewResponse(data);
  }

  @MessagePattern(TRUST_PATTERNS.GET_REVIEW_WITH_RESPONSE)
  async getReviewWithResponse(@Payload() data: any) {
    return this.trustService.getReviewWithResponse(data?.reviewId);
  }
}

