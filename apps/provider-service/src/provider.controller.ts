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
    return this.providerService.getProviderBookingById(data.bookingId);
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
    return this.providerService.getMyServices(data.providerId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_PROFILE_DRAFT)
  async getProfileDraft(@Payload() data: any) {
    return this.providerService.getProfileDraft(data.userId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_RESCHEDULES)
  async getRescheduleRequests(@Payload() data: any) {
    return this.providerService.getRescheduleRequests(data.bookingId);
  }

  @MessagePattern(PROVIDER_PATTERNS.GET_ADDITIONAL_CHARGES)
  async getAdditionalCharges(@Payload() data: any) {
    return this.providerService.getAdditionalCharges(data.bookingId);
  }

  @EventPattern(PROVIDER_PATTERNS.REUPLOAD_KYC)
  async reuploadKyc(@Payload() data: any) {
    const file = data.file
      ? ({ ...data.file, buffer: Buffer.from(data.file.buffer, 'base64') } as Express.Multer.File)
      : null;
    return this.providerService.reuploadKycDocument(data.userId, file!);

  }

  @EventPattern(PROVIDER_PATTERNS.UPDATE_BOOKING_STATUS)
  async updateProviderBookingStatus(@Payload() data: any) {
    return this.providerService.updateProviderBookingStatus(data.bookingId, data.status);
  }

  @EventPattern(PROVIDER_PATTERNS.SAVE_AVAILABILITY)
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

  @EventPattern(PROVIDER_PATTERNS.CREATE_RESCHEDULE)
  async createRescheduleRequest(@Payload() data: any) {
    return this.providerService.createRescheduleRequest(data);
  }

  @EventPattern(PROVIDER_PATTERNS.REVIEW_RESCHEDULE)
  async reviewRescheduleRequest(@Payload() data: any) {
    return this.providerService.reviewRescheduleRequest(data.requestId, data);
  }

  @EventPattern(PROVIDER_PATTERNS.CREATE_ADDITIONAL_CHARGES)
  async createAdditionalCharges(@Payload() data: any) {
    return this.providerService.createAdditionalCharges(data);
  }

  @EventPattern(PROVIDER_PATTERNS.REVIEW_ADDITIONAL_CHARGES)
  async reviewAdditionalCharges(@Payload() data: any) {
    return this.providerService.reviewAdditionalCharges(data);
  }

  @EventPattern(PROVIDER_PATTERNS.SUBMIT_REVIEW)
  async submitReview(@Payload() data: any) {
    return this.providerService.submitReview(data);
  }

  @EventPattern(PROVIDER_PATTERNS.SUBMIT_REPORT)
  async submitReport(@Payload() data: any) {
    return this.providerService.submitReport(data);
  }
}
