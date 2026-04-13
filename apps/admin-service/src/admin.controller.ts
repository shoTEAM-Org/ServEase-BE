import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { ADMIN_PATTERNS } from '@app/common';
import { AdminService } from './admin.service.js';

@Controller()
export class AdminKafkaController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  // Existing
  @EventPattern(ADMIN_PATTERNS.UPDATE_DOCUMENT_STATUS)
  async updateDocumentStatus(@Payload() data: any) {
    return this.adminService.updateDocumentStatus(data.documentId, data);
  }

  // === USER MANAGEMENT ===
  @MessagePattern(ADMIN_PATTERNS.GET_CUSTOMERS)
  async getCustomers(@Payload() data: any) {
    return this.adminService.getCustomers(data.page, data.limit);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_CUSTOMER_BY_ID)
  async getCustomerById(@Payload() data: any) {
    return this.adminService.getCustomerById(data.id);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_CUSTOMER_STATUS)
  async updateCustomerStatus(@Payload() data: any) {
    return this.adminService.updateCustomerStatus(data.id, data.status);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_REVIEWS)
  async getReviews(@Payload() data: any) {
    return this.adminService.getReviews(data.page, data.limit);
  }

  @EventPattern(ADMIN_PATTERNS.DELETE_REVIEW)
  async deleteReview(@Payload() data: any) {
    return this.adminService.deleteReview(data.id);
  }

  // === ACCOUNT ===
  @MessagePattern(ADMIN_PATTERNS.GET_ADMIN_PROFILE)
  async getAdminProfile(@Payload() data: any) {
    return this.adminService.getAdminProfile(data.userId);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_ADMIN_PROFILE)
  async updateAdminProfile(@Payload() data: any) {
    return this.adminService.updateAdminProfile(data.userId, data);
  }

  // === OPERATIONS ===
  @MessagePattern(ADMIN_PATTERNS.GET_ONGOING)
  async getOngoing(@Payload() data: any) {
    return this.adminService.getOngoingServices();
  }

  @MessagePattern(ADMIN_PATTERNS.GET_DISPUTES)
  async getDisputes(@Payload() data: any) {
    return this.adminService.getDisputes(data.page, data.limit);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_DISPUTE)
  async updateDispute(@Payload() data: any) {
    return this.adminService.updateDisputeStatus(data.id, data.status);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_SUPPORT_TICKETS)
  async getSupportTickets(@Payload() data: any) {
    return this.adminService.getSupportTickets(data.page, data.limit);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_SUPPORT_TICKET)
  async updateSupportTicket(@Payload() data: any) {
    return this.adminService.updateSupportTicket(data.id, data.status);
  }

  // === FINANCE ===
  @MessagePattern(ADMIN_PATTERNS.GET_EARNINGS)
  async getEarnings(@Payload() data: any) {
    return this.adminService.getProviderEarnings(data.page, data.limit);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_PAYOUTS)
  async getPayouts(@Payload() data: any) {
    return this.adminService.getPayouts(data.page, data.limit);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_PAYOUT)
  async updatePayout(@Payload() data: any) {
    return this.adminService.updatePayout(data.id, data.status);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_REFUNDS)
  async getRefunds(@Payload() data: any) {
    return this.adminService.getRefunds(data.page, data.limit);
  }

  @EventPattern(ADMIN_PATTERNS.MARK_REFUND)
  async markRefund(@Payload() data: any) {
    return this.adminService.markRefund(data.id);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_FAILED_PAYMENTS)
  async getFailedPayments(@Payload() data: any) {
    return this.adminService.getFailedPayments(data.page, data.limit);
  }

  // === MARKETPLACE ===
  @MessagePattern(ADMIN_PATTERNS.CREATE_CATEGORY)
  async createCategory(@Payload() data: any) {
    return this.adminService.createCategory(data);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_CATEGORY)
  async updateCategory(@Payload() data: any) {
    const { id, ...body } = data;
    return this.adminService.updateCategory(id, body);
  }

  @EventPattern(ADMIN_PATTERNS.DELETE_CATEGORY)
  async deleteCategory(@Payload() data: any) {
    return this.adminService.deleteCategory(data.id);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_ALL_SERVICES)
  async getAllServices(@Payload() data: any) {
    return this.adminService.getAllServicesAdmin(data.page, data.limit);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_SERVICE)
  async updateService(@Payload() data: any) {
    const { id, ...body } = data;
    return this.adminService.updateService(id, body);
  }

  @EventPattern(ADMIN_PATTERNS.DELETE_SERVICE)
  async deleteService(@Payload() data: any) {
    return this.adminService.deleteService(data.id);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_SERVICE_AREAS)
  async getServiceAreas() {
    return this.adminService.getServiceAreas();
  }

  @MessagePattern(ADMIN_PATTERNS.CREATE_SERVICE_AREA)
  async createServiceArea(@Payload() data: any) {
    return this.adminService.createServiceArea(data);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_SERVICE_AREA)
  async updateServiceArea(@Payload() data: any) {
    const { id, ...body } = data;
    return this.adminService.updateServiceArea(id, body);
  }

  @EventPattern(ADMIN_PATTERNS.DELETE_SERVICE_AREA)
  async deleteServiceArea(@Payload() data: any) {
    return this.adminService.deleteServiceArea(data.id);
  }

  @EventPattern(ADMIN_PATTERNS.SEND_BROADCAST)
  async sendBroadcast(@Payload() data: any) {
    return this.adminService.sendBroadcast(data);
  }

  // === REPORTS ===
  @MessagePattern(ADMIN_PATTERNS.GET_REVENUE_REPORT)
  async getRevenueReport(@Payload() data: any) {
    return this.adminService.getRevenueReport(data.from, data.to);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_BOOKING_ANALYTICS)
  async getBookingAnalytics(@Payload() data: any) {
    return this.adminService.getBookingAnalytics(data.from, data.to);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_BUSINESS_REPORT)
  async getBusinessReport(@Payload() data: any) {
    return this.adminService.getBusinessReport(data.from, data.to);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_FINANCIAL_REPORT)
  async getFinancialReport(@Payload() data: any) {
    return this.adminService.getFinancialReport(data.from, data.to);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_USER_REPORT)
  async getUserReport(@Payload() data: any) {
    return this.adminService.getUserReport(data.from, data.to);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_PERFORMANCE_REPORT)
  async getPerformanceReport(@Payload() data: any) {
    return this.adminService.getPerformanceReport(data.from, data.to);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_COMPLIANCE_REPORT)
  async getComplianceReport(@Payload() data: any) {
    return this.adminService.getComplianceReport(data.from, data.to);
  }
}
