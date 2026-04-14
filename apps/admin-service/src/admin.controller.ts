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

  @MessagePattern(ADMIN_PATTERNS.GET_ACCOUNT_SETTINGS)
  async getAccountSettings(@Payload() data: any) {
    return this.adminService.getAccountSettings(data.userId);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_ACCOUNT_SETTINGS)
  async updateAccountSettings(@Payload() data: any) {
    const { userId, ...body } = data;
    return this.adminService.updateAccountSettings(userId, body);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_ACTIVITY_LOG)
  async getActivityLog(@Payload() data: any) {
    return this.adminService.getActivityLog(data.userId, data.page, data.limit, data.from, data.to);
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

  @MessagePattern(ADMIN_PATTERNS.GET_PROMOTIONS)
  async getPromotions(@Payload() data: any) {
    const { page, limit, ...filters } = data;
    return this.adminService.getPromotions(page, limit, filters);
  }

  @MessagePattern(ADMIN_PATTERNS.CREATE_PROMOTION)
  async createPromotion(@Payload() data: any) {
    return this.adminService.createPromotion(data);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_PROMOTION)
  async updatePromotion(@Payload() data: any) {
    const { id, ...body } = data;
    return this.adminService.updatePromotion(id, body);
  }

  @EventPattern(ADMIN_PATTERNS.DELETE_PROMOTION)
  async deletePromotion(@Payload() data: any) {
    return this.adminService.deletePromotion(data.id);
  }

  // === SETTINGS ===
  @MessagePattern(ADMIN_PATTERNS.GET_COMMISSION)
  async getCommission() {
    return this.adminService.getCommission();
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_COMMISSION)
  async updateCommission(@Payload() data: any) {
    return this.adminService.updateCommission(data);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_ROLES)
  async getRoles(@Payload() data: any) {
    return this.adminService.getRoles(data.page, data.limit);
  }

  @MessagePattern(ADMIN_PATTERNS.CREATE_ROLE)
  async createRole(@Payload() data: any) {
    return this.adminService.createRole(data);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_ROLE)
  async updateRole(@Payload() data: any) {
    const { id, ...body } = data;
    return this.adminService.updateRole(id, body);
  }

  @EventPattern(ADMIN_PATTERNS.DELETE_ROLE)
  async deleteRole(@Payload() data: any) {
    return this.adminService.deleteRole(data.id);
  }

  @EventPattern(ADMIN_PATTERNS.ASSIGN_ROLE)
  async assignRole(@Payload() data: any) {
    return this.adminService.assignRole(data);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_SECURITY)
  async getSecuritySettings() {
    return this.adminService.getSecuritySettings();
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_SECURITY)
  async updateSecuritySettings(@Payload() data: any) {
    return this.adminService.updateSecuritySettings(data);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_NOTIFICATION_SETTINGS)
  async getNotificationSettings(@Payload() data: any) {
    return this.adminService.getNotificationSettings(data.page, data.limit);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_NOTIFICATION_SETTING)
  async updateNotificationSetting(@Payload() data: any) {
    const { id, ...body } = data;
    return this.adminService.updateNotificationSetting(id, body);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_AUDIT_LOGS)
  async getAuditLogs(@Payload() data: any) {
    const { page, limit, ...filters } = data;
    return this.adminService.getAuditLogs(page, limit, filters);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_INTEGRATIONS)
  async getIntegrations() {
    return this.adminService.getIntegrations();
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_INTEGRATION)
  async updateIntegration(@Payload() data: any) {
    const { id, ...body } = data;
    return this.adminService.updateIntegration(id, body);
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
