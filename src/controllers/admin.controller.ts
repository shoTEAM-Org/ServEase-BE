import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Request,
  UseGuards, Inject, OnModuleInit, HttpCode,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { ADMIN_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/admin')
@UseGuards(SupabaseAuthGuard)
export class AdminController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [
      ADMIN_PATTERNS.GET_CUSTOMERS,
      ADMIN_PATTERNS.GET_CUSTOMER_BY_ID,
      ADMIN_PATTERNS.GET_REVIEWS,
      ADMIN_PATTERNS.GET_ADMIN_PROFILE,
      ADMIN_PATTERNS.GET_ONGOING,
      ADMIN_PATTERNS.GET_DISPUTES,
      ADMIN_PATTERNS.GET_SUPPORT_TICKETS,
      ADMIN_PATTERNS.GET_EARNINGS,
      ADMIN_PATTERNS.GET_PAYOUTS,
      ADMIN_PATTERNS.GET_REFUNDS,
      ADMIN_PATTERNS.GET_FAILED_PAYMENTS,
      ADMIN_PATTERNS.CREATE_CATEGORY,
      ADMIN_PATTERNS.GET_ALL_SERVICES,
      ADMIN_PATTERNS.GET_SERVICE_AREAS,
      ADMIN_PATTERNS.CREATE_SERVICE_AREA,
      ADMIN_PATTERNS.GET_REVENUE_REPORT,
      ADMIN_PATTERNS.GET_BOOKING_ANALYTICS,
      ADMIN_PATTERNS.GET_BUSINESS_REPORT,
      ADMIN_PATTERNS.GET_FINANCIAL_REPORT,
      ADMIN_PATTERNS.GET_USER_REPORT,
      ADMIN_PATTERNS.GET_PERFORMANCE_REPORT,
      ADMIN_PATTERNS.GET_COMPLIANCE_REPORT,
      // Account settings & activity log (stubs)
      ADMIN_PATTERNS.GET_ACCOUNT_SETTINGS,
      ADMIN_PATTERNS.GET_ACTIVITY_LOG,
      // Promotions (stubs)
      ADMIN_PATTERNS.GET_PROMOTIONS,
      ADMIN_PATTERNS.CREATE_PROMOTION,
      // Settings (stubs)
      ADMIN_PATTERNS.GET_COMMISSION,
      ADMIN_PATTERNS.GET_ROLES,
      ADMIN_PATTERNS.CREATE_ROLE,
      ADMIN_PATTERNS.GET_SECURITY,
      ADMIN_PATTERNS.GET_NOTIFICATION_SETTINGS,
      ADMIN_PATTERNS.GET_AUDIT_LOGS,
      ADMIN_PATTERNS.GET_INTEGRATIONS,
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  // ── Existing ──────────────────────────────────────────────
  @Patch('v2/documents/status/:id') @HttpCode(202)
  updateDocumentStatus(@Param('id') id: string, @Body() dto: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_DOCUMENT_STATUS, { documentId: id, ...dto });
    return { status: 'accepted' };
  }

  // ── USER MANAGEMENT ───────────────────────────────────────
  @Get('v1/users/customers')
  getCustomers(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_CUSTOMERS, { page: +page, limit: +limit }));
  }

  @Get('v1/users/customers/:id')
  getCustomerById(@Param('id') id: string) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_CUSTOMER_BY_ID, { id }));
  }

  @Patch('v1/users/customers/:id/status') @HttpCode(202)
  updateCustomerStatus(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_CUSTOMER_STATUS, { id, status });
    return { status: 'accepted' };
  }

  @Get('v1/users/reviews')
  getReviews(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_REVIEWS, { page: +page, limit: +limit }));
  }

  @Delete('v1/users/reviews/:id') @HttpCode(202)
  deleteReview(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.DELETE_REVIEW, { id });
    return { status: 'accepted' };
  }

  // ── ACCOUNT ───────────────────────────────────────────────
  @Get('v1/account/profile')
  getAdminProfile(@Request() req: any) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_ADMIN_PROFILE, { userId: req['user'].id }));
  }

  @Patch('v1/account/profile') @HttpCode(202)
  updateAdminProfile(@Request() req: any, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_ADMIN_PROFILE, { userId: req['user'].id, ...body });
    return { status: 'accepted' };
  }

  @Get('v1/account/settings')
  getAccountSettings(@Request() req: any) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_ACCOUNT_SETTINGS, { userId: req['user'].id }));
  }

  @Patch('v1/account/settings') @HttpCode(202)
  updateAccountSettings(@Request() req: any, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_ACCOUNT_SETTINGS, { userId: req['user'].id, ...body });
    return { status: 'accepted' };
  }

  @Get('v1/account/activity-log')
  getActivityLog(
    @Request() req: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_ACTIVITY_LOG, {
      userId: req['user'].id, page: +page, limit: +limit, from, to,
    }));
  }

  // ── OPERATIONS ────────────────────────────────────────────
  @Get('v1/operations/ongoing')
  getOngoing() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_ONGOING, {}));
  }

  @Get('v1/operations/disputes')
  getDisputes(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_DISPUTES, { page: +page, limit: +limit }));
  }

  @Patch('v1/operations/disputes/:id') @HttpCode(202)
  updateDispute(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_DISPUTE, { id, status });
    return { status: 'accepted' };
  }

  @Get('v1/operations/support')
  getSupportTickets(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_SUPPORT_TICKETS, { page: +page, limit: +limit }));
  }

  @Patch('v1/operations/support/:id') @HttpCode(202)
  updateSupportTicket(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_SUPPORT_TICKET, { id, status });
    return { status: 'accepted' };
  }

  // ── FINANCE ───────────────────────────────────────────────
  @Get('v1/finance/earnings')
  getEarnings(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_EARNINGS, { page: +page, limit: +limit }));
  }

  @Get('v1/finance/payouts')
  getPayouts(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_PAYOUTS, { page: +page, limit: +limit }));
  }

  @Patch('v1/finance/payouts/:id') @HttpCode(202)
  updatePayout(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_PAYOUT, { id, status });
    return { status: 'accepted' };
  }

  @Get('v1/finance/refunds')
  getRefunds(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_REFUNDS, { page: +page, limit: +limit }));
  }

  @Patch('v1/finance/refunds/:id') @HttpCode(202)
  markRefund(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.MARK_REFUND, { id });
    return { status: 'accepted' };
  }

  @Get('v1/finance/failed')
  getFailedPayments(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_FAILED_PAYMENTS, { page: +page, limit: +limit }));
  }

  // ── MARKETPLACE ───────────────────────────────────────────
  @Post('v1/marketplace/categories')
  createCategory(@Body() body: any) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.CREATE_CATEGORY, body));
  }

  @Patch('v1/marketplace/categories/:id') @HttpCode(202)
  updateCategory(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_CATEGORY, { id, ...body });
    return { status: 'accepted' };
  }

  @Delete('v1/marketplace/categories/:id') @HttpCode(202)
  deleteCategory(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.DELETE_CATEGORY, { id });
    return { status: 'accepted' };
  }

  @Get('v1/marketplace/services')
  getAllServices(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_ALL_SERVICES, { page: +page, limit: +limit }));
  }

  @Patch('v1/marketplace/services/:id') @HttpCode(202)
  updateService(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_SERVICE, { id, ...body });
    return { status: 'accepted' };
  }

  @Delete('v1/marketplace/services/:id') @HttpCode(202)
  deleteService(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.DELETE_SERVICE, { id });
    return { status: 'accepted' };
  }

  @Get('v1/marketplace/service-areas')
  getServiceAreas() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_SERVICE_AREAS, {}));
  }

  @Post('v1/marketplace/service-areas')
  createServiceArea(@Body() body: any) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.CREATE_SERVICE_AREA, body));
  }

  @Patch('v1/marketplace/service-areas/:id') @HttpCode(202)
  updateServiceArea(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_SERVICE_AREA, { id, ...body });
    return { status: 'accepted' };
  }

  @Delete('v1/marketplace/service-areas/:id') @HttpCode(202)
  deleteServiceArea(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.DELETE_SERVICE_AREA, { id });
    return { status: 'accepted' };
  }

  @Post('v1/marketplace/broadcasts') @HttpCode(202)
  sendBroadcast(@Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.SEND_BROADCAST, body);
    return { status: 'accepted' };
  }

  @Get('v1/marketplace/promotions')
  getPromotions(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_PROMOTIONS, {
      page: +page, limit: +limit, status, type, search,
    }));
  }

  @Post('v1/marketplace/promotions')
  createPromotion(@Body() body: any) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.CREATE_PROMOTION, body));
  }

  @Patch('v1/marketplace/promotions/:id') @HttpCode(202)
  updatePromotion(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_PROMOTION, { id, ...body });
    return { status: 'accepted' };
  }

  @Delete('v1/marketplace/promotions/:id') @HttpCode(202)
  deletePromotion(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.DELETE_PROMOTION, { id });
    return { status: 'accepted' };
  }

  // ── SETTINGS ─────────────────────────────────────────────
  @Get('v1/settings/commission')
  getCommission() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_COMMISSION, {}));
  }

  @Patch('v1/settings/commission') @HttpCode(202)
  updateCommission(@Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_COMMISSION, body);
    return { status: 'accepted' };
  }

  @Get('v1/settings/roles')
  getRoles(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_ROLES, { page: +page, limit: +limit }));
  }

  @Post('v1/settings/roles')
  createRole(@Body() body: any) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.CREATE_ROLE, body));
  }

  @Patch('v1/settings/roles/:id') @HttpCode(202)
  updateRole(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_ROLE, { id, ...body });
    return { status: 'accepted' };
  }

  @Delete('v1/settings/roles/:id') @HttpCode(202)
  deleteRole(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.DELETE_ROLE, { id });
    return { status: 'accepted' };
  }

  @Post('v1/settings/roles/assign') @HttpCode(202)
  assignRole(@Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.ASSIGN_ROLE, body);
    return { status: 'accepted' };
  }

  @Get('v1/settings/security')
  getSecuritySettings() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_SECURITY, {}));
  }

  @Patch('v1/settings/security') @HttpCode(202)
  updateSecuritySettings(@Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_SECURITY, body);
    return { status: 'accepted' };
  }

  @Get('v1/settings/notifications')
  getNotificationSettings(@Query('page') page = '1', @Query('limit') limit = '20') {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_NOTIFICATION_SETTINGS, { page: +page, limit: +limit }));
  }

  @Patch('v1/settings/notifications/:id') @HttpCode(202)
  updateNotificationSetting(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_NOTIFICATION_SETTING, { id, ...body });
    return { status: 'accepted' };
  }

  @Get('v1/settings/logs')
  getAuditLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('user_id') userId?: string,
    @Query('action') action?: string,
  ) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_AUDIT_LOGS, {
      page: +page, limit: +limit, from, to, user_id: userId, action,
    }));
  }

  @Get('v1/settings/integrations')
  getIntegrations() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_INTEGRATIONS, {}));
  }

  @Patch('v1/settings/integrations/:id') @HttpCode(202)
  updateIntegration(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_INTEGRATION, { id, ...body });
    return { status: 'accepted' };
  }

  // ── REPORTS ───────────────────────────────────────────────
  @Get('v1/reports/revenue')
  getRevenueReport(@Query('from') from?: string, @Query('to') to?: string) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_REVENUE_REPORT, { from, to }));
  }

  @Get('v1/reports/bookings')
  getBookingAnalytics(@Query('from') from?: string, @Query('to') to?: string) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_BOOKING_ANALYTICS, { from, to }));
  }

  @Get('v1/reports/business')
  getBusinessReport(@Query('from') from?: string, @Query('to') to?: string) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_BUSINESS_REPORT, { from, to }));
  }

  @Get('v1/reports/financial')
  getFinancialReport(@Query('from') from?: string, @Query('to') to?: string) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_FINANCIAL_REPORT, { from, to }));
  }

  @Get('v1/reports/users')
  getUserReport(@Query('from') from?: string, @Query('to') to?: string) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_USER_REPORT, { from, to }));
  }

  @Get('v1/reports/performance')
  getPerformanceReport(@Query('from') from?: string, @Query('to') to?: string) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_PERFORMANCE_REPORT, { from, to }));
  }

  @Get('v1/reports/compliance')
  getComplianceReport(@Query('from') from?: string, @Query('to') to?: string) {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_COMPLIANCE_REPORT, { from, to }));
  }
}
