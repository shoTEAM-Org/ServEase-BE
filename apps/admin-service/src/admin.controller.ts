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

  @MessagePattern(ADMIN_PATTERNS.UPDATE_CUSTOMER_STATUS)
  async updateCustomerStatus(@Payload() data: any) {
    return this.adminService.updateCustomerStatus(data.id, data.status);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_PROVIDERS)
  async getProviders(@Payload() data: any) {
    return this.adminService.getProviders(data.page, data.limit);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_PROVIDER_BY_ID)
  async getProviderById(@Payload() data: any) {
    return this.adminService.getProviderById(data.id);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_PROVIDER_STATUS)
  async updateProviderStatus(@Payload() data: any) {
    return this.adminService.updateProviderStatus(data.id, data.status);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_PROVIDER_APPLICATIONS)
  async getProviderApplications(@Payload() data: any) {
    return this.adminService.getProviderApplications(data.page, data.limit, data.status);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_PROVIDER_APPLICATION_BY_ID)
  async getProviderApplicationById(@Payload() data: any) {
    return this.adminService.getProviderApplicationById(data.id);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_PROVIDER_APPLICATION_STATUS)
  async updateProviderApplicationStatus(@Payload() data: any) {
    return this.adminService.updateProviderApplicationStatus(data.id, data.status, data.reject_reason);
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
  @MessagePattern(ADMIN_PATTERNS.GET_ALL_BOOKINGS)
  async getAllBookings(@Payload() data: any) {
    return this.adminService.getAllBookings(data.page, data.limit);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_ONGOING)
  async getOngoing(@Payload() data: any) {
    return this.adminService.getOngoingServices();
  }

  @MessagePattern(ADMIN_PATTERNS.UPDATE_BOOKING_STATUS)
  async updateBookingStatus(@Payload() data: any) {
    return this.adminService.updateBookingStatus(data.id, data.status);
  }

  @EventPattern(ADMIN_PATTERNS.CREATE_BOOKING_DISPUTE)
  async createBookingDispute(@Payload() data: any) {
    return this.adminService.createBookingDispute(data.bookingId, data.userId, data.reason);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_DISPUTES)
  async getDisputes(@Payload() data: any) {
    return this.adminService.getDisputes(data.page, data.limit, data.status);
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
  @MessagePattern(ADMIN_PATTERNS.GET_TRANSACTIONS)
  async getTransactions(@Payload() data: any) {
    return this.adminService.getTransactions(data.page, data.limit);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_EARNINGS)
  async getEarnings(@Payload() data: any) {
    return this.adminService.getProviderEarnings(data.page, data.limit);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_PAYOUTS)
  async getPayouts(@Payload() data: any) {
    return this.adminService.getPayouts(data.page, data.limit);
  }

  @MessagePattern(ADMIN_PATTERNS.UPDATE_PAYOUT)
  async updatePayout(@Payload() data: any) {
    console.log('[admin-service controller] UPDATE_PAYOUT received', {
      id: data?.id,
      status: data?.status,
      payload: data,
    });
    const response = await this.adminService.updatePayout(data.id, data.status);
    console.log('[admin-service controller] UPDATE_PAYOUT response', response);
    return response;
  }

  @MessagePattern(ADMIN_PATTERNS.GET_REFUNDS)
  async getRefunds(@Payload() data: any) {
    return this.adminService.getRefunds(data.page, data.limit);
  }

  @MessagePattern(ADMIN_PATTERNS.MARK_REFUND)
  async markRefund(@Payload() data: any) {
    return this.adminService.markRefund(data.id, data.status, data.reject_reason);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_FAILED_PAYMENTS)
  async getFailedPayments(@Payload() data: any) {
    return this.adminService.getFailedPayments(data.page, data.limit);
  }

  // === MARKETPLACE ===
  @MessagePattern(ADMIN_PATTERNS.GET_CATEGORIES)
  async getCategories(@Payload() data: any) {
    return this.adminService.getCategories(data.page, data.limit);
  }

  @MessagePattern(ADMIN_PATTERNS.CREATE_CATEGORY)
  async createCategory(@Payload() data: any) {
    return this.adminService.createCategory(data);
  }

  @MessagePattern(ADMIN_PATTERNS.UPDATE_CATEGORY)
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

  @MessagePattern(ADMIN_PATTERNS.CREATE_SERVICE)
  async createService(@Payload() data: any) {
    return this.adminService.createService(data);
  }

  @MessagePattern(ADMIN_PATTERNS.UPDATE_SERVICE)
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

  // === PLATFORM SETTINGS ===

  @MessagePattern(ADMIN_PATTERNS.GET_SETTINGS)
  async getSettings() {
    return this.adminService.getSettings();
  }

  @MessagePattern(ADMIN_PATTERNS.UPDATE_SETTINGS)
  async updateSettings(@Payload() data: any) {
    return this.adminService.updateSettings(data);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_NOTIFICATION_SETTINGS)
  async getNotificationSettings() {
    return this.adminService.getNotificationSettings();
  }

  @MessagePattern(ADMIN_PATTERNS.UPDATE_NOTIFICATION_SETTINGS)
  async updateNotificationSettings(@Payload() data: any) {
    return this.adminService.updateNotificationSettings(data);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_SECURITY_SETTINGS)
  async getSecuritySettings() {
    return this.adminService.getSecuritySettings();
  }

  @MessagePattern(ADMIN_PATTERNS.UPDATE_SECURITY_SETTINGS)
  async updateSecuritySettings(@Payload() data: any) {
    return this.adminService.updateSecuritySettings(data);
  }

  // === INTEGRATIONS ===

  @MessagePattern(ADMIN_PATTERNS.GET_INTEGRATIONS)
  async getIntegrations() {
    return this.adminService.getIntegrations();
  }

  @MessagePattern(ADMIN_PATTERNS.TOGGLE_INTEGRATION)
  async toggleIntegration(@Payload() data: any) {
    return this.adminService.toggleIntegration(data.service, data.enabled);
  }

  @MessagePattern(ADMIN_PATTERNS.TEST_INTEGRATION)
  async testIntegration(@Payload() data: any) {
    return this.adminService.testIntegration(data.service);
  }

  // === COMMISSION RULES ===

  @MessagePattern(ADMIN_PATTERNS.GET_COMMISSION_RULES)
  async getCommissionRules() {
    return this.adminService.getCommissionRules();
  }

  @MessagePattern(ADMIN_PATTERNS.UPDATE_COMMISSION_RULE)
  async updateCommissionRule(@Payload() data: any) {
    return this.adminService.updateCommissionRule(data.ruleId, data.currentRate);
  }

  // === ADMIN ROLES ===
  @MessagePattern(ADMIN_PATTERNS.GET_ADMINS)
  async getAdmins(@Payload() data: any) {
    return this.adminService.getAdmins(data?.page, data?.limit);
  }

  // === AUDIT LOGS ===
  @MessagePattern(ADMIN_PATTERNS.GET_AUDIT_LOGS)
  async getAuditLogs(@Payload() data: any) {
    return this.adminService.getAuditLogs(data?.page, data?.limit, data?.action, data?.userId);
  }
}
