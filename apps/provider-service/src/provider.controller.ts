import 'multer';
import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { PROVIDER_PATTERNS } from '@app/common';
import { ProviderService } from './provider.service.js';

@Controller()
export class ProviderKafkaController {
  constructor(
    @Inject(ProviderService) private readonly providerService: ProviderService,
  ) {}

  @MessagePattern(PROVIDER_PATTERNS.GET_STATUS)
  async getProviderStatus(@Payload() data: any) {
    return this.providerService.getProviderStatus(data.providerId);
  }

  @MessagePattern(PROVIDER_PATTERNS.UPDATE_STATUS)
  async updateProviderStatus(@Payload() data: any) {
    return this.providerService.updateProviderStatus(data.providerId, data.status);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_BY_SERVICE)
  async getProvidersByService(@Payload() data: any) {
    return this.providerService.getProvidersByService(data.serviceId);
  }

  @MessagePattern(PROVIDER_PATTERNS.SEARCH)
  async searchProviders(@Payload() data: any) {
    return this.providerService.searchProviders(data.searchTerm);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_PROFILE)
  async getProviderProfile(@Payload() data: any) {
    return this.providerService.getProviderProfile(data.userId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_SERVICES_BY_IDS)
  async getServicesByIds(@Payload() data: any) {
    return this.providerService.getServicesByIds(data?.serviceIds);
  }

  @MessagePattern(PROVIDER_PATTERNS.CREATE_PROVIDER_APPLICATION)
  async createProviderApplication(@Payload() data: any) {
    return this.providerService.createProviderApplication(data);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS)
  async getProviderProfilesByIds(@Payload() data: any) {
    return this.providerService.getProviderProfilesByIds(data?.userIds);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_APPLICATIONS)
  async getProviderApplications(@Payload() data: any) {
    return this.providerService.getProviderApplications(
      data?.page,
      data?.limit,
      data?.status,
    );
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_APPLICATION_BY_ID)
  async getProviderApplicationById(@Payload() data: any) {
    return this.providerService.getProviderApplicationById(data?.id);
  }

  @MessagePattern(PROVIDER_PATTERNS.UPDATE_APPLICATION_STATUS)
  async updateProviderApplicationStatus(@Payload() data: any) {
    return this.providerService.updateProviderApplicationStatus(
      data?.id,
      data?.status,
      data?.reject_reason,
    );
  }

  @MessagePattern(PROVIDER_PATTERNS.UPDATE_DOCUMENT_STATUS)
  async updateDocumentStatus(@Payload() data: any) {
    return this.providerService.updateDocumentStatus(data?.documentId, data);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_REQUIRED_DOCUMENT_TYPES)
  async getRequiredDocumentTypes() {
    return this.providerService.getRequiredDocumentTypes();
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_MY_VERIFICATION)
  async getMyVerification(@Payload() data: any) {
    return this.providerService.getMyVerification(data?.userId);
  }

  @MessagePattern(PROVIDER_PATTERNS.UPLOAD_DOCUMENT)
  async uploadDocument(@Payload() data: any) {
    const file = data.file
      ? ({ ...data.file, buffer: Buffer.from(data.file.buffer, 'base64') } as Express.Multer.File)
      : null;
    return this.providerService.uploadDocument(
      data?.userId,
      data?.document_type,
      file!,
    );
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_MY_DOCUMENTS)
  async getMyDocuments(@Payload() data: any) {
    return this.providerService.getMyDocuments(data?.userId);
  }

  @MessagePattern(PROVIDER_PATTERNS.DELETE_MY_DOCUMENT)
  async deleteMyDocument(@Payload() data: any) {
    return this.providerService.deleteMyDocument(data?.userId, data?.documentId);
  }

  @MessagePattern(PROVIDER_PATTERNS.SUBMIT_FOR_REVIEW)
  async submitForReview(@Payload() data: any) {
    return this.providerService.submitForReview(data?.userId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_ADMIN_SERVICES)
  async getAdminServices(@Payload() data: any) {
    return this.providerService.getAdminServices(data?.page, data?.limit);
  }

  @MessagePattern(PROVIDER_PATTERNS.UPDATE_ADMIN_SERVICE)
  async updateAdminService(@Payload() data: any) {
    return this.providerService.updateAdminService(data?.id, data?.body);
  }

  @MessagePattern(PROVIDER_PATTERNS.DELETE_ADMIN_SERVICE)
  async deleteAdminService(@Payload() data: any) {
    return this.providerService.deleteAdminService(data?.id);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_ALL_REVIEWS)
  async getAllReviews(@Payload() data: any) {
    return this.providerService.getAllReviews(data?.page, data?.limit);
  }

  @MessagePattern(PROVIDER_PATTERNS.DELETE_REVIEW)
  async deleteReview(@Payload() data: any) {
    return this.providerService.deleteReview(data?.id);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_PERFORMANCE_REPORT)
  async getPerformanceReport(@Payload() data: any) {
    return this.providerService.getPerformanceReport(data?.from, data?.to);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_COMPLIANCE_REPORT)
  async getComplianceReport(@Payload() data: any) {
    return this.providerService.getComplianceReport(data?.from, data?.to);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_DASHBOARD)
  async getProviderDashboard(@Payload() data: any) {
    return this.providerService.getProviderDashboard(data.providerId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_TRUST_SCORE)
  async getTrustScore(@Payload() data: any) {
    return this.providerService.getTrustScore(data.providerId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_REVIEWS)
  async getProviderReviews(@Payload() data: any) {
    return this.providerService.getProviderReviews(data.providerId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_BOOKINGS)
  async getProviderBookings(@Payload() data: any) {
    return this.providerService.getProviderBookings(data.providerId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_BOOKING_BY_ID)
  async getProviderBookingById(@Payload() data: any) {
    return this.providerService.getProviderBookingById(
      data.bookingId,
      data.providerId,
    );
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_AVAILABILITY)
  async getProviderAvailability(@Payload() data: any) {
    return this.providerService.getProviderAvailability(data.userId, data.accessToken);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_RESERVED_SLOTS)
  async getReservedSlots(@Payload() data: any) {
    return this.providerService.getReservedSlots(data.providerId, data.date);
  }

  @MessagePattern(PROVIDER_PATTERNS.CHECK_AVAILABILITY)
  async checkAvailability(@Payload() data: any) {
    return this.providerService.checkAvailability(data.providerId, data.scheduledAt, data.hoursRequired);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_MY_SERVICES)
  async getMyServices(@Payload() data: any) {
    return this.providerService.getMyServices(data.providerId, data.activeOnly === true);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_PRICING_GUIDANCE)
  async getPricingGuidance(@Payload() data: any) {
    return this.providerService.getPricingGuidance(data.providerId, data);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_PROFILE_DRAFT)
  async getProfileDraft(@Payload() data: any) {
    return this.providerService.getProfileDraft(data.userId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_ADDITIONAL_CHARGES)
  async getAdditionalCharges(@Payload() data: any) {
    return this.providerService.getAdditionalCharges(
      data.bookingId,
      data.providerId,
    );
  }

  @EventPattern(PROVIDER_PATTERNS.REUPLOAD_KYC)
  async reuploadKyc(@Payload() data: any) {
    const file = data.file
      ? ({ ...data.file, buffer: Buffer.from(data.file.buffer, 'base64') } as Express.Multer.File)
      : null;
    return this.providerService.reuploadKycDocument(data.userId, file!);

  }

  @MessagePattern(PROVIDER_PATTERNS.UPDATE_BOOKING_STATUS)
  async updateProviderBookingStatus(@Payload() data: any) {
    return this.providerService.updateProviderBookingStatus(
      data.bookingId,
      data.status,
      data.providerId,
    );
  }

  @MessagePattern(PROVIDER_PATTERNS.SAVE_AVAILABILITY)
  async saveProviderAvailability(@Payload() data: any) {
    const { userId, accessToken, ...body } = data || {};
    return this.providerService.saveProviderAvailability(userId, body, accessToken);
  }

  @EventPattern(PROVIDER_PATTERNS.CREATE_MY_SERVICE)
  async createMyService(@Payload() data: any) {
    const { providerId, ...body } = data || {};
    return this.providerService.createMyService(providerId, body);
  }

  @EventPattern(PROVIDER_PATTERNS.UPDATE_MY_SERVICE)
  async updateMyService(@Payload() data: any) {
    const { serviceId, providerId, ...body } = data || {};
    return this.providerService.updateMyService(serviceId, providerId, body);
  }

  @EventPattern(PROVIDER_PATTERNS.DELETE_MY_SERVICE)
  async deleteMyService(@Payload() data: any) {
    return this.providerService.deleteMyService(data.serviceId, data.providerId);
  }

  @EventPattern(PROVIDER_PATTERNS.SAVE_PROFILE_DRAFT)
  async saveProfileDraft(@Payload() data: any) {
    return this.providerService.saveProfileDraft(data.userId, data);
  }

  @EventPattern(PROVIDER_PATTERNS.CREATE_ADDITIONAL_CHARGES)
  async createAdditionalCharges(@Payload() data: any) {
    return this.providerService.createAdditionalCharges(data);
  }

  @EventPattern(PROVIDER_PATTERNS.REVIEW_ADDITIONAL_CHARGES)
  async reviewAdditionalCharges(@Payload() data: any) {
    return this.providerService.reviewAdditionalCharges(data);
  }

  @MessagePattern(PROVIDER_PATTERNS.SUBMIT_REVIEW)
  async submitReview(@Payload() data: any) {
    return this.providerService.submitReview(data);
  }

  @MessagePattern(PROVIDER_PATTERNS.SUBMIT_REPORT)
  async submitReport(@Payload() data: any) {
    return this.providerService.submitReport(data);
  }

  // Review Response handlers - delegate to trust service
  @MessagePattern(PROVIDER_PATTERNS.CREATE_REVIEW_RESPONSE)
  async createReviewResponse(@Payload() data: any) {
    return this.providerService.createReviewResponse(data);
  }

  @MessagePattern(PROVIDER_PATTERNS.UPDATE_REVIEW_RESPONSE)
  async updateReviewResponse(@Payload() data: any) {
    return this.providerService.updateReviewResponse(data);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_REVIEW_WITH_RESPONSE)
  async getReviewWithResponse(@Payload() data: any) {
    return this.providerService.getReviewWithResponse(data);
  }
}
