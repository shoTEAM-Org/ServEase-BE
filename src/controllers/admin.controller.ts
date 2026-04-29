import {
  Controller,
  Get,
  Post,
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
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { sendWithTimeout } from '../utils/kafka-request.js';
import { ADMIN_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';
import { AdminRoleGuard } from '../guards/admin-role.guard.js';

@Controller('api/admin')
@UseGuards(SupabaseAuthGuard, AdminRoleGuard)
export class AdminController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [
      ADMIN_PATTERNS.GET_CUSTOMERS,
      ADMIN_PATTERNS.GET_CUSTOMER_BY_ID,
      ADMIN_PATTERNS.GET_PROVIDERS,
      ADMIN_PATTERNS.GET_PROVIDER_BY_ID,
      ADMIN_PATTERNS.GET_PROVIDER_APPLICATIONS,
      ADMIN_PATTERNS.GET_PROVIDER_APPLICATION_BY_ID,
      ADMIN_PATTERNS.GET_REVIEWS,
      ADMIN_PATTERNS.GET_ADMIN_PROFILE,
      ADMIN_PATTERNS.GET_ALL_BOOKINGS,
      ADMIN_PATTERNS.GET_ONGOING,
      ADMIN_PATTERNS.GET_DISPUTES,
      ADMIN_PATTERNS.GET_SUPPORT_TICKETS,
      ADMIN_PATTERNS.GET_TRANSACTIONS,
      ADMIN_PATTERNS.GET_EARNINGS,
      ADMIN_PATTERNS.GET_PAYOUTS,
      ADMIN_PATTERNS.GET_REFUNDS,
      ADMIN_PATTERNS.GET_FAILED_PAYMENTS,
      ADMIN_PATTERNS.GET_CATEGORIES,
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
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
  }

  // ── Existing ──────────────────────────────────────────────
  @Patch('v2/documents/status/:id')
  async updateDocumentStatus(@Param('id') id: string, @Body() dto: any) {
    return await sendWithTimeout(
      this.kafka.send(ADMIN_PATTERNS.UPDATE_DOCUMENT_STATUS, {
        ...dto,
        documentId: id,
      }),
    );
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
  @HttpCode(202)
  updateCustomerStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_CUSTOMER_STATUS, { id, status });
    return { status: 'accepted' };
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
    @Query('status') status = 'pending',
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
      ...body,
      id,
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

  @Get('v1/account/activity-log')
  getActivityLog(@Query('page') page = '1', @Query('limit') limit = '50') {
    return { logs: [], total: 0, page: +page, limit: +limit };
  }

  @Patch('v1/account/profile')
  @HttpCode(202)
  updateAdminProfile(@Request() req: any, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_ADMIN_PROFILE, {
      ...body,
      userId: req['user'].id,
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
  @HttpCode(202)
  updateBookingStatus(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_BOOKING_STATUS, { id, status });
    return { status: 'accepted' };
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
  updatePayout(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_PAYOUT, { id, status });
    return { status: 'accepted' };
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
  markRefund(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.MARK_REFUND, { id });
    return { status: 'accepted' };
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
  @HttpCode(202)
  updateCategory(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_CATEGORY, { ...body, id });
    return { status: 'accepted' };
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

  @Patch('v1/marketplace/services/:id')
  @HttpCode(202)
  updateService(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_SERVICE, { ...body, id });
    return { status: 'accepted' };
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
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_SERVICE_AREA, { ...body, id });
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
}
