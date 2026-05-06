import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  Inject,
  OnModuleInit,
  HttpCode,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { sendWithTimeout } from '../utils/kafka-request.js';
import { ADMIN_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/admin')
@UseGuards(SupabaseAuthGuard)
export class AdminController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  private buildAdminHttpError(error: any, fallback: string) {
    const response = error?.response;
    const status =
      Number(
        response?.statusCode ||
          response?.status ||
          error?.statusCode ||
          error?.status,
      ) || 500;
    const rawMessage = response?.message || error?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.filter((item: any) => typeof item === 'string').join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : fallback;

    if (status === 400) return new BadRequestException(message || fallback);
    if (status === 404) return new NotFoundException(message || fallback);
    return new InternalServerErrorException(
      !message || message === 'Internal server error' ? fallback : message,
    );
  }

  async onModuleInit() {
    [
      ADMIN_PATTERNS.GET_CUSTOMERS,
      ADMIN_PATTERNS.GET_CUSTOMER_BY_ID,
      ADMIN_PATTERNS.UPDATE_CUSTOMER_STATUS,
      ADMIN_PATTERNS.GET_PROVIDERS,
      ADMIN_PATTERNS.GET_PROVIDER_BY_ID,
      ADMIN_PATTERNS.GET_PROVIDER_APPLICATIONS,
      ADMIN_PATTERNS.GET_PROVIDER_APPLICATION_BY_ID,
      ADMIN_PATTERNS.GET_REVIEWS,
      ADMIN_PATTERNS.GET_ADMIN_PROFILE,
      ADMIN_PATTERNS.GET_ALL_BOOKINGS,
      ADMIN_PATTERNS.GET_ONGOING,
      ADMIN_PATTERNS.UPDATE_BOOKING_STATUS,
      ADMIN_PATTERNS.GET_DISPUTES,
      ADMIN_PATTERNS.GET_SUPPORT_TICKETS,
      ADMIN_PATTERNS.GET_TRANSACTIONS,
      ADMIN_PATTERNS.GET_EARNINGS,
      ADMIN_PATTERNS.GET_PAYOUTS,
      ADMIN_PATTERNS.UPDATE_PAYOUT,
      ADMIN_PATTERNS.GET_REFUNDS,
      ADMIN_PATTERNS.MARK_REFUND,
      ADMIN_PATTERNS.GET_FAILED_PAYMENTS,
      ADMIN_PATTERNS.GET_CATEGORIES,
      ADMIN_PATTERNS.CREATE_CATEGORY,
      ADMIN_PATTERNS.GET_ALL_SERVICES,
      ADMIN_PATTERNS.CREATE_SERVICE,
      ADMIN_PATTERNS.UPDATE_SERVICE,
      ADMIN_PATTERNS.GET_SERVICE_AREAS,
      ADMIN_PATTERNS.CREATE_SERVICE_AREA,
      ADMIN_PATTERNS.UPDATE_CATEGORY,
      ADMIN_PATTERNS.GET_REVENUE_REPORT,
      ADMIN_PATTERNS.GET_BOOKING_ANALYTICS,
      ADMIN_PATTERNS.GET_BUSINESS_REPORT,
      ADMIN_PATTERNS.GET_FINANCIAL_REPORT,
      ADMIN_PATTERNS.GET_USER_REPORT,
      ADMIN_PATTERNS.GET_PERFORMANCE_REPORT,
      ADMIN_PATTERNS.GET_COMPLIANCE_REPORT,
      ADMIN_PATTERNS.GET_NOTIFICATION_SETTINGS,
      ADMIN_PATTERNS.UPDATE_NOTIFICATION_SETTINGS,
      ADMIN_PATTERNS.GET_SECURITY_SETTINGS,
      ADMIN_PATTERNS.UPDATE_SECURITY_SETTINGS,
      ADMIN_PATTERNS.GET_INTEGRATIONS,
      ADMIN_PATTERNS.TOGGLE_INTEGRATION,
      ADMIN_PATTERNS.TEST_INTEGRATION,
      ADMIN_PATTERNS.GET_COMMISSION_RULES,
      ADMIN_PATTERNS.UPDATE_COMMISSION_RULE,
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  // ── Existing ──────────────────────────────────────────────
  @Patch('v2/documents/status/:id')
  @HttpCode(202)
  updateDocumentStatus(@Param('id') id: string, @Body() dto: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_DOCUMENT_STATUS, {
      documentId: id,
      ...dto,
    });
    return { status: 'accepted' };
  }

  // ── USER MANAGEMENT ───────────────────────────────────────
  @Get('v1/users/customers')
  getCustomers(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_CUSTOMERS, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Get('v1/users/customers/:id')
  getCustomerById(@Param('id') id: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_CUSTOMER_BY_ID, { id }),
    );
  }

  @Patch('v1/users/customers/:id/status')
  updateCustomerStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.UPDATE_CUSTOMER_STATUS, { id, status }),
    );
  }

  @Get('v1/users/providers')
  getProviders(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_PROVIDERS, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Get('v1/users/providers/:id')
  getProviderById(@Param('id') id: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_PROVIDER_BY_ID, { id }),
    );
  }

  @Patch('v1/users/providers/:id/status')
  @HttpCode(202)
  updateProviderStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_PROVIDER_STATUS, { id, status });
    return { status: 'accepted' };
  }

  @Get('v1/users/provider-applications')
  getProviderApplications(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status = 'all',
  ) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_PROVIDER_APPLICATIONS, {
        page: +page,
        limit: +limit,
        status,
      }),
    );
  }

  @Get('v1/users/provider-applications/:id')
  getProviderApplicationById(@Param('id') id: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_PROVIDER_APPLICATION_BY_ID, { id }),
    );
  }

  @Patch('v1/users/provider-applications/:id/status')
  @HttpCode(202)
  updateProviderApplicationStatus(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_PROVIDER_APPLICATION_STATUS, {
      id,
      ...body,
    });
    return { status: 'accepted' };
  }

  @Get('v1/users/reviews')
  getReviews(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_REVIEWS, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Delete('v1/users/reviews/:id')
  @HttpCode(202)
  deleteReview(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.DELETE_REVIEW, { id });
    return { status: 'accepted' };
  }

  // ── ACCOUNT ───────────────────────────────────────────────
  @Get('v1/account/profile')
  getAdminProfile(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_ADMIN_PROFILE, {
        userId: req['user'].id,
      }),
    );
  }

  @Patch('v1/account/profile')
  @HttpCode(202)
  updateAdminProfile(@Request() req: any, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_ADMIN_PROFILE, {
      userId: req['user'].id,
      ...body,
    });
    return { status: 'accepted' };
  }

  // ── OPERATIONS ────────────────────────────────────────────
  @Get('v1/operations/bookings')
  getAllBookings(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_ALL_BOOKINGS, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Get('v1/operations/ongoing')
  getOngoing() {
    return sendWithTimeout(this.kafka.send(ADMIN_PATTERNS.GET_ONGOING, {}));
  }

  @Patch('v1/operations/bookings/:id/status')
  updateBookingStatus(@Param('id') id: string, @Body('status') status: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.UPDATE_BOOKING_STATUS, { id, status }),
    );
  }

  @Post('v1/operations/bookings/:id/disputes')
  @HttpCode(202)
  createBookingDispute(
    @Param('id') id: string,
    @Request() req: any,
    @Body('reason') reason: string,
  ) {
    this.kafka.emit(ADMIN_PATTERNS.CREATE_BOOKING_DISPUTE, {
      bookingId: id,
      userId: req['user'].id,
      reason,
    });
    return { status: 'accepted' };
  }

  @Get('v1/operations/disputes')
  getDisputes(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
  ) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_DISPUTES, {
        page: +page,
        limit: +limit,
        status,
      }),
    );
  }

  @Patch('v1/operations/disputes/:id')
  @HttpCode(202)
  updateDispute(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_DISPUTE, { id, status });
    return { status: 'accepted' };
  }

  @Get('v1/operations/support')
  getSupportTickets(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_SUPPORT_TICKETS, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Patch('v1/operations/support/:id')
  @HttpCode(202)
  updateSupportTicket(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_SUPPORT_TICKET, { id, status });
    return { status: 'accepted' };
  }

  // ── FINANCE ───────────────────────────────────────────────
  @Get('v1/finance/transactions')
  getTransactions(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_TRANSACTIONS, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Get('v1/finance/earnings')
  getEarnings(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_EARNINGS, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Get('v1/finance/payouts')
  getPayouts(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_PAYOUTS, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Patch('v1/finance/payouts/:id')
  @HttpCode(202)
  async updatePayout(@Param('id') id: string, @Body('status') status: string) {
    try {
      console.log('[admin-gateway] PATCH payout received', { id, status });
      const response = await sendWithTimeout(
        this.kafka.send(ADMIN_PATTERNS.UPDATE_PAYOUT, { id, status }),
      );
      console.log('[admin-gateway] PATCH payout response', response);
      return response;
    } catch (error) {
      console.log('[admin-gateway] PATCH payout error', error);
      throw this.buildAdminHttpError(error, 'Failed to update payout status');
    }
  }

  @Get('v1/finance/refunds')
  getRefunds(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_REFUNDS, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Patch('v1/finance/refunds/:id')
  @HttpCode(202)
  async markRefund(@Param('id') id: string, @Body() body: any) {
    try {
      return await sendWithTimeout(
        this.kafka.send(ADMIN_PATTERNS.MARK_REFUND, { id, ...body }),
      );
    } catch (error) {
      throw this.buildAdminHttpError(error, 'Failed to update refund status');
    }
  }

  @Get('v1/finance/failed')
  getFailedPayments(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_FAILED_PAYMENTS, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  // ── MARKETPLACE ───────────────────────────────────────────
  @Get('v1/marketplace/categories')
  getCategories(@Query('page') page = '1', @Query('limit') limit = '100') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_CATEGORIES, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Post('v1/marketplace/categories')
  createCategory(@Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.CREATE_CATEGORY, body),
    );
  }

  @Patch('v1/marketplace/categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.UPDATE_CATEGORY, { id, ...body }),
    );
  }

  @Delete('v1/marketplace/categories/:id')
  @HttpCode(202)
  deleteCategory(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.DELETE_CATEGORY, { id });
    return { status: 'accepted' };
  }

  @Get('v1/marketplace/services')
  getAllServices(@Query('page') page = '1', @Query('limit') limit = '20') {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_ALL_SERVICES, {
        page: +page,
        limit: +limit,
      }),
    );
  }

  @Post('v1/marketplace/services')
  createService(@Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.CREATE_SERVICE, body),
    );
  }

  @Patch('v1/marketplace/services/:id')
  async updateService(@Param('id') id: string, @Body() body: any) {
    try {
      return await sendWithTimeout(
        this.kafka.send(ADMIN_PATTERNS.UPDATE_SERVICE, { id, ...body }),
      );
    } catch (error) {
      throw this.buildAdminHttpError(error, 'Failed to update service');
    }
  }

  @Delete('v1/marketplace/services/:id')
  @HttpCode(202)
  deleteService(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.DELETE_SERVICE, { id });
    return { status: 'accepted' };
  }

  @Get('v1/marketplace/service-areas')
  getServiceAreas() {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_SERVICE_AREAS, {}),
    );
  }

  @Post('v1/marketplace/service-areas')
  createServiceArea(@Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.CREATE_SERVICE_AREA, body),
    );
  }

  @Patch('v1/marketplace/service-areas/:id')
  @HttpCode(202)
  updateServiceArea(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_SERVICE_AREA, { id, ...body });
    return { status: 'accepted' };
  }

  @Delete('v1/marketplace/service-areas/:id')
  @HttpCode(202)
  deleteServiceArea(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.DELETE_SERVICE_AREA, { id });
    return { status: 'accepted' };
  }

  @Post('v1/marketplace/broadcasts')
  @HttpCode(202)
  sendBroadcast(@Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.SEND_BROADCAST, body);
    return { status: 'accepted' };
  }

  // ── REPORTS ───────────────────────────────────────────────
  @Get('v1/reports/revenue')
  getRevenueReport(@Query('from') from?: string, @Query('to') to?: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_REVENUE_REPORT, { from, to }),
    );
  }

  @Get('v1/reports/bookings')
  getBookingAnalytics(@Query('from') from?: string, @Query('to') to?: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_BOOKING_ANALYTICS, { from, to }),
    );
  }

  @Get('v1/reports/business')
  getBusinessReport(@Query('from') from?: string, @Query('to') to?: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_BUSINESS_REPORT, { from, to }),
    );
  }

  @Get('v1/reports/financial')
  getFinancialReport(@Query('from') from?: string, @Query('to') to?: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_FINANCIAL_REPORT, { from, to }),
    );
  }

  @Get('v1/reports/users')
  getUserReport(@Query('from') from?: string, @Query('to') to?: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_USER_REPORT, { from, to }),
    );
  }

  @Get('v1/reports/performance')
  getPerformanceReport(@Query('from') from?: string, @Query('to') to?: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_PERFORMANCE_REPORT, { from, to }),
    );
  }

  @Get('v1/reports/compliance')
  getComplianceReport(@Query('from') from?: string, @Query('to') to?: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_COMPLIANCE_REPORT, { from, to }),
    );
  }

  // ── PLATFORM SETTINGS ──────────────────────────────────────
  @Get('v1/settings/notifications')
  getNotificationSettings() {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_NOTIFICATION_SETTINGS, {}),
    );
  }

  @Put('v1/settings/notifications')
  updateNotificationSettings(@Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.UPDATE_NOTIFICATION_SETTINGS, body),
    );
  }

  @Get('v1/settings/security')
  getSecuritySettings() {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_SECURITY_SETTINGS, {}),
    );
  }

  @Put('v1/settings/security')
  updateSecuritySettings(@Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.UPDATE_SECURITY_SETTINGS, body),
    );
  }

  // ── INTEGRATIONS ───────────────────────────────────────────
  @Get('v1/settings/integrations')
  getIntegrations() {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_INTEGRATIONS, {}),
    );
  }

  @Put('v1/settings/integrations/:service/toggle')
  toggleIntegration(@Param('service') service: string, @Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.TOGGLE_INTEGRATION, { service, enabled: body.enabled }),
    );
  }

  @Post('v1/settings/integrations/:service/test')
  testIntegration(@Param('service') service: string) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.TEST_INTEGRATION, { service }),
    );
  }

  // ── COMMISSION RULES ───────────────────────────────────────
  @Get('v1/commission-rules')
  getCommissionRules() {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.GET_COMMISSION_RULES, {}),
    );
  }

  @Put('v1/commission-rules/:id')
  updateCommissionRule(@Param('id') id: string, @Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.UPDATE_COMMISSION_RULE, { ruleId: id, currentRate: body.currentRate }),
    );
  }
}
