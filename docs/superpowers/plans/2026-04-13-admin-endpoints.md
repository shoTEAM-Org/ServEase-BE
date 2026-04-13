# Admin Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all missing admin panel endpoints across User Management, Account, Operations, Finance, Marketplace & Marketing, and Reports & Analytics.

**Architecture:** All new logic lives in the existing `apps/admin-service`. Kafka patterns are domain-namespaced (`admin.users.*`, `admin.account.*`, `admin.ops.*`, `admin.finance.*`, `admin.marketplace.*`, `admin.reports.*`). The existing gateway `src/controllers/admin.controller.ts` is extended with new HTTP routes, all under `/api/admin/` and all requiring `SupabaseAuthGuard`.

**Tech Stack:** NestJS, Kafka (`@nestjs/microservices`), Supabase (`@supabase/supabase-js`), TypeScript

---

## Files Modified

| File | Change |
|---|---|
| `libs/common/src/kafka/patterns.ts` | Add all new `ADMIN_PATTERNS` |
| `apps/admin-service/src/admin.service.ts` | Add all new service methods |
| `apps/admin-service/src/admin.controller.ts` | Add `@MessagePattern` / `@EventPattern` handlers |
| `src/controllers/admin.controller.ts` | Add new HTTP routes |
| `API-Endpoints.md` | Document all new endpoints |

## Files Created

| File | Purpose |
|---|---|
| `docs/admin-pending-endpoints.md` | List of endpoints requiring new Supabase tables |

---

## Task 1: Add ADMIN_PATTERNS to patterns.ts

**Files:**
- Modify: `libs/common/src/kafka/patterns.ts`

- [ ] **Replace the existing `ADMIN_PATTERNS` block** (lines 89–91) with the full domain-namespaced version:

```typescript
export const ADMIN_PATTERNS = {
  // Existing
  UPDATE_DOCUMENT_STATUS: 'admin.update-document-status',

  // User Management
  GET_CUSTOMERS: 'admin.users.get-customers',
  GET_CUSTOMER_BY_ID: 'admin.users.get-customer-by-id',
  UPDATE_CUSTOMER_STATUS: 'admin.users.update-customer-status',
  GET_REVIEWS: 'admin.users.get-reviews',
  DELETE_REVIEW: 'admin.users.delete-review',

  // Account
  GET_ADMIN_PROFILE: 'admin.account.get-profile',
  UPDATE_ADMIN_PROFILE: 'admin.account.update-profile',

  // Operations
  GET_ONGOING: 'admin.ops.get-ongoing',
  GET_DISPUTES: 'admin.ops.get-disputes',
  UPDATE_DISPUTE: 'admin.ops.update-dispute',
  GET_SUPPORT_TICKETS: 'admin.ops.get-support-tickets',
  UPDATE_SUPPORT_TICKET: 'admin.ops.update-support-ticket',

  // Finance
  GET_EARNINGS: 'admin.finance.get-earnings',
  GET_PAYOUTS: 'admin.finance.get-payouts',
  UPDATE_PAYOUT: 'admin.finance.update-payout',
  GET_REFUNDS: 'admin.finance.get-refunds',
  MARK_REFUND: 'admin.finance.mark-refund',
  GET_FAILED_PAYMENTS: 'admin.finance.get-failed-payments',

  // Marketplace
  CREATE_CATEGORY: 'admin.marketplace.create-category',
  UPDATE_CATEGORY: 'admin.marketplace.update-category',
  DELETE_CATEGORY: 'admin.marketplace.delete-category',
  GET_ALL_SERVICES: 'admin.marketplace.get-all-services',
  UPDATE_SERVICE: 'admin.marketplace.update-service',
  DELETE_SERVICE: 'admin.marketplace.delete-service',
  GET_SERVICE_AREAS: 'admin.marketplace.get-service-areas',
  CREATE_SERVICE_AREA: 'admin.marketplace.create-service-area',
  UPDATE_SERVICE_AREA: 'admin.marketplace.update-service-area',
  DELETE_SERVICE_AREA: 'admin.marketplace.delete-service-area',
  SEND_BROADCAST: 'admin.marketplace.send-broadcast',

  // Reports
  GET_REVENUE_REPORT: 'admin.reports.revenue',
  GET_BOOKING_ANALYTICS: 'admin.reports.bookings',
  GET_BUSINESS_REPORT: 'admin.reports.business',
  GET_FINANCIAL_REPORT: 'admin.reports.financial',
  GET_USER_REPORT: 'admin.reports.users',
  GET_PERFORMANCE_REPORT: 'admin.reports.performance',
  GET_COMPLIANCE_REPORT: 'admin.reports.compliance',
} as const;
```

- [ ] **Commit**

```bash
git add libs/common/src/kafka/patterns.ts
git commit -m "feat(admin): add domain-namespaced ADMIN_PATTERNS"
```

---

## Task 2: Implement Admin Service — User Management & Account

**Files:**
- Modify: `apps/admin-service/src/admin.service.ts`

- [ ] **Add imports** at the top of the existing file:

```typescript
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
```

(These are already present — confirm they are and move on if so.)

- [ ] **Append User Management methods** to the class body:

```typescript
// === USER MANAGEMENT ===

async getCustomers(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { data, error, count } = await this.supabase
    .schema('identity_and_user')
    .from('users')
    .select('id, full_name, email, contact_number, status, created_at', { count: 'exact' })
    .eq('role', 'customer')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new InternalServerErrorException(error.message);
  return { customers: data || [], total: count || 0, page, limit };
}

async getCustomerById(id: string) {
  const { data: user, error } = await this.supabase
    .schema('identity_and_user')
    .from('users')
    .select('id, full_name, email, contact_number, status, created_at')
    .eq('id', id)
    .eq('role', 'customer')
    .single();
  if (error) throw new NotFoundException(`Customer ${id} not found`);

  const { data: profile } = await this.supabase
    .schema('identity_and_user')
    .from('customer_profiles')
    .select('*')
    .eq('user_id', id)
    .single();

  const { count: bookingCount } = await this.supabase
    .schema('booking')
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', id);

  return { user, profile: profile || null, booking_count: bookingCount || 0 };
}

async updateCustomerStatus(id: string, status: string) {
  const { error } = await this.supabase
    .schema('identity_and_user')
    .from('users')
    .update({ status })
    .eq('id', id)
    .eq('role', 'customer');
  if (error) throw new BadRequestException(error.message);
  return { ok: true };
}

async getReviews(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { data, error, count } = await this.supabase
    .schema('trust_and_reputation')
    .from('reviews')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new InternalServerErrorException(error.message);
  return { reviews: data || [], total: count || 0, page, limit };
}

async deleteReview(id: string) {
  const { error } = await this.supabase
    .schema('trust_and_reputation')
    .from('reviews')
    .delete()
    .eq('id', id);
  if (error) throw new InternalServerErrorException(error.message);
  return { ok: true };
}

// === ACCOUNT ===

async getAdminProfile(userId: string) {
  const { data, error } = await this.supabase
    .schema('identity_and_user')
    .from('users')
    .select('id, full_name, email, contact_number, status, created_at')
    .eq('id', userId)
    .eq('role', 'admin')
    .single();
  if (error) throw new NotFoundException('Admin profile not found');
  return { profile: data };
}

async updateAdminProfile(userId: string, updates: Record<string, any>) {
  const allowed = ['full_name', 'contact_number'];
  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  const { error } = await this.supabase
    .schema('identity_and_user')
    .from('users')
    .update(filtered)
    .eq('id', userId)
    .eq('role', 'admin');
  if (error) throw new InternalServerErrorException(error.message);
  return { ok: true };
}
```

- [ ] **Commit**

```bash
git add apps/admin-service/src/admin.service.ts
git commit -m "feat(admin): add user management and account service methods"
```

---

## Task 3: Implement Admin Service — Operations & Finance

**Files:**
- Modify: `apps/admin-service/src/admin.service.ts`

- [ ] **Append Operations methods** to the class body:

```typescript
// === OPERATIONS ===

async getOngoingServices() {
  const { data, error } = await this.supabase
    .schema('booking')
    .from('bookings')
    .select('*')
    .in('status', ['confirmed', 'in_progress'])
    .order('scheduled_at', { ascending: true });
  if (error) throw new InternalServerErrorException(error.message);

  const bookings = await Promise.all((data || []).map(async (b: any) => {
    const { data: provider } = await this.supabase
      .schema('identity_and_user').from('users')
      .select('full_name').eq('id', b.provider_id).single();
    const { data: customer } = await this.supabase
      .schema('identity_and_user').from('users')
      .select('full_name').eq('id', b.customer_id).single();
    return {
      ...b,
      provider_name: provider?.full_name || '',
      customer_name: customer?.full_name || '',
    };
  }));

  return { bookings };
}

async getDisputes() {
  const { data, error } = await this.supabase
    .schema('notification_and_support')
    .from('disputes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new InternalServerErrorException(error.message);
  return { disputes: data || [] };
}

async updateDisputeStatus(id: string, status: string) {
  const { error } = await this.supabase
    .schema('notification_and_support')
    .from('disputes')
    .update({ status })
    .eq('id', id);
  if (error) throw new BadRequestException(error.message);
  return { ok: true };
}

async getSupportTickets() {
  const { data, error } = await this.supabase
    .schema('notification_and_support')
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new InternalServerErrorException(error.message);
  return { tickets: data || [] };
}

async updateSupportTicket(id: string, status: string) {
  const { error } = await this.supabase
    .schema('notification_and_support')
    .from('support_tickets')
    .update({ status })
    .eq('id', id);
  if (error) throw new BadRequestException(error.message);
  return { ok: true };
}
```

- [ ] **Append Finance methods** to the class body:

```typescript
// === FINANCE ===

async getProviderEarnings() {
  const { data, error } = await this.supabase
    .schema('payment')
    .from('payments')
    .select('*')
    .eq('status', 'completed')
    .order('created_at', { ascending: false });
  if (error) throw new InternalServerErrorException(error.message);
  return { payments: data || [] };
}

async getPayouts() {
  const { data, error } = await this.supabase
    .schema('payment')
    .from('provider_payouts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new InternalServerErrorException(error.message);
  return { payouts: data || [] };
}

async updatePayout(id: string, status: string) {
  const { error } = await this.supabase
    .schema('payment')
    .from('provider_payouts')
    .update({ status })
    .eq('id', id);
  if (error) throw new BadRequestException(error.message);
  return { ok: true };
}

async getRefunds() {
  const { data, error } = await this.supabase
    .schema('payment')
    .from('payments')
    .select('*')
    .in('status', ['refunded', 'cancelled'])
    .order('created_at', { ascending: false });
  if (error) throw new InternalServerErrorException(error.message);
  return { payments: data || [] };
}

async markRefund(id: string) {
  const { error } = await this.supabase
    .schema('payment')
    .from('payments')
    .update({ status: 'refunded' })
    .eq('id', id);
  if (error) throw new BadRequestException(error.message);
  return { ok: true };
}

async getFailedPayments() {
  const { data, error } = await this.supabase
    .schema('payment')
    .from('payments')
    .select('*')
    .eq('status', 'failed')
    .order('created_at', { ascending: false });
  if (error) throw new InternalServerErrorException(error.message);
  return { payments: data || [] };
}
```

- [ ] **Commit**

```bash
git add apps/admin-service/src/admin.service.ts
git commit -m "feat(admin): add operations and finance service methods"
```

---

## Task 4: Implement Admin Service — Marketplace & Reports

**Files:**
- Modify: `apps/admin-service/src/admin.service.ts`

- [ ] **Append Marketplace methods** to the class body:

```typescript
// === MARKETPLACE ===

async createCategory(body: any) {
  const { data, error } = await this.supabase
    .schema('provider_catalog')
    .from('service_categories')
    .insert([body])
    .select()
    .single();
  if (error) throw new BadRequestException(error.message);
  return { category: data };
}

async updateCategory(id: string, body: any) {
  const { error } = await this.supabase
    .schema('provider_catalog')
    .from('service_categories')
    .update(body)
    .eq('id', id);
  if (error) throw new BadRequestException(error.message);
  return { ok: true };
}

async deleteCategory(id: string) {
  const { error } = await this.supabase
    .schema('provider_catalog')
    .from('service_categories')
    .delete()
    .eq('id', id);
  if (error) throw new InternalServerErrorException(error.message);
  return { ok: true };
}

async getAllServicesAdmin(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { data, error, count } = await this.supabase
    .schema('provider_catalog')
    .from('provider_services')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new InternalServerErrorException(error.message);
  return { services: data || [], total: count || 0, page, limit };
}

async updateService(id: string, body: any) {
  const { provider_id, id: _id, ...updates } = body;
  const { error } = await this.supabase
    .schema('provider_catalog')
    .from('provider_services')
    .update(updates)
    .eq('id', id);
  if (error) throw new BadRequestException(error.message);
  return { ok: true };
}

async deleteService(id: string) {
  const { error } = await this.supabase
    .schema('provider_catalog')
    .from('provider_services')
    .delete()
    .eq('id', id);
  if (error) throw new InternalServerErrorException(error.message);
  return { ok: true };
}

async getServiceAreas() {
  const { data, error } = await this.supabase
    .schema('provider_catalog')
    .from('location')
    .select('*');
  if (error) throw new InternalServerErrorException(error.message);
  return { areas: data || [] };
}

async createServiceArea(body: any) {
  const { data, error } = await this.supabase
    .schema('provider_catalog')
    .from('location')
    .insert([body])
    .select()
    .single();
  if (error) throw new BadRequestException(error.message);
  return { area: data };
}

async updateServiceArea(id: string, body: any) {
  const { error } = await this.supabase
    .schema('provider_catalog')
    .from('location')
    .update(body)
    .eq('id', id);
  if (error) throw new BadRequestException(error.message);
  return { ok: true };
}

async deleteServiceArea(id: string) {
  const { error } = await this.supabase
    .schema('provider_catalog')
    .from('location')
    .delete()
    .eq('id', id);
  if (error) throw new InternalServerErrorException(error.message);
  return { ok: true };
}

async sendBroadcast(body: {
  user_ids?: string[];
  role?: string;
  title: string;
  message: string;
  type?: string;
}) {
  let userIds: string[] = body.user_ids || [];

  if (!userIds.length && body.role) {
    const { data: users } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('id')
      .eq('role', body.role);
    userIds = (users || []).map((u: any) => u.id);
  }

  if (!userIds.length) throw new BadRequestException('No target users found');

  const notifications = userIds.map((uid: string) => ({
    user_id: uid,
    title: body.title,
    message: body.message,
    type: body.type || 'broadcast',
    is_read: false,
  }));

  const { error } = await this.supabase
    .schema('notification_and_support')
    .from('notifications')
    .insert(notifications);
  if (error) throw new InternalServerErrorException(error.message);
  return { ok: true, sent_to: userIds.length };
}
```

- [ ] **Append Reports methods** to the class body:

```typescript
// === REPORTS ===

private buildDateFilter(query: any, from?: string, to?: string, column = 'created_at') {
  if (from) query = query.gte(column, from);
  if (to) query = query.lte(column, to);
  return query;
}

async getRevenueReport(from?: string, to?: string) {
  let query = this.supabase
    .schema('payment')
    .from('payments')
    .select('amount, status, created_at, provider_id');
  query = this.buildDateFilter(query, from, to);
  const { data, error } = await query;
  if (error) throw new InternalServerErrorException(error.message);

  const completed = (data || []).filter((p: any) => p.status === 'completed');
  const total = completed.reduce((acc: number, p: any) => acc + Number(p.amount), 0);
  const platformFees = total * 0.1;
  return {
    total_revenue: total,
    platform_fees: platformFees,
    net_to_providers: total - platformFees,
    transaction_count: completed.length,
  };
}

async getBookingAnalytics(from?: string, to?: string) {
  let query = this.supabase
    .schema('booking')
    .from('bookings')
    .select('status, created_at');
  query = this.buildDateFilter(query, from, to);
  const { data, error } = await query;
  if (error) throw new InternalServerErrorException(error.message);

  const bookings = data || [];
  const byStatus = bookings.reduce((acc: any, b: any) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});
  return { total: bookings.length, by_status: byStatus };
}

async getUserReport(from?: string, to?: string) {
  let query = this.supabase
    .schema('identity_and_user')
    .from('users')
    .select('role, status, created_at');
  query = this.buildDateFilter(query, from, to);
  const { data, error } = await query;
  if (error) throw new InternalServerErrorException(error.message);

  const users = data || [];
  const byRole = users.reduce((acc: any, u: any) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});
  const byStatus = users.reduce((acc: any, u: any) => {
    acc[u.status] = (acc[u.status] || 0) + 1;
    return acc;
  }, {});
  return { total: users.length, by_role: byRole, by_status: byStatus };
}

async getBusinessReport(from?: string, to?: string) {
  const [revenue, bookings, users] = await Promise.all([
    this.getRevenueReport(from, to),
    this.getBookingAnalytics(from, to),
    this.getUserReport(from, to),
  ]);
  return { revenue, bookings, users };
}

async getFinancialReport(from?: string, to?: string) {
  let paymentsQuery = this.supabase
    .schema('payment')
    .from('payments')
    .select('*');
  let payoutsQuery = this.supabase
    .schema('payment')
    .from('provider_payouts')
    .select('*');
  paymentsQuery = this.buildDateFilter(paymentsQuery, from, to);
  payoutsQuery = this.buildDateFilter(payoutsQuery, from, to);

  const [{ data: payments }, { data: payouts }] = await Promise.all([
    paymentsQuery,
    payoutsQuery,
  ]);
  return { payments: payments || [], payouts: payouts || [] };
}

async getPerformanceReport(from?: string, to?: string) {
  let query = this.supabase
    .schema('trust_and_reputation')
    .from('reviews')
    .select('reviewee_id, rating, created_at');
  query = this.buildDateFilter(query, from, to);
  const { data: reviews, error } = await query;
  if (error) throw new InternalServerErrorException(error.message);

  const { data: profiles } = await this.supabase
    .schema('provider_catalog')
    .from('provider_profiles')
    .select('user_id, business_name, average_rating, total_reviews, trust_score, verification_status');

  return { reviews: reviews || [], provider_profiles: profiles || [] };
}

async getComplianceReport(from?: string, to?: string) {
  let disputesQuery = this.supabase
    .schema('notification_and_support')
    .from('disputes')
    .select('*');
  let reportsQuery = this.supabase
    .schema('trust_and_reputation')
    .from('provider_profile_reports')
    .select('*');
  disputesQuery = this.buildDateFilter(disputesQuery, from, to);
  reportsQuery = this.buildDateFilter(reportsQuery, from, to);

  const [{ data: disputes }, { data: reports }] = await Promise.all([
    disputesQuery,
    reportsQuery,
  ]);
  return { disputes: disputes || [], provider_reports: reports || [] };
}
```

- [ ] **Commit**

```bash
git add apps/admin-service/src/admin.service.ts
git commit -m "feat(admin): add marketplace and reports service methods"
```

---

## Task 5: Extend Admin Kafka Controller

**Files:**
- Modify: `apps/admin-service/src/admin.controller.ts`

- [ ] **Replace the entire file** with:

```typescript
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
  async getOngoing() {
    return this.adminService.getOngoingServices();
  }

  @MessagePattern(ADMIN_PATTERNS.GET_DISPUTES)
  async getDisputes() {
    return this.adminService.getDisputes();
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_DISPUTE)
  async updateDispute(@Payload() data: any) {
    return this.adminService.updateDisputeStatus(data.id, data.status);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_SUPPORT_TICKETS)
  async getSupportTickets() {
    return this.adminService.getSupportTickets();
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_SUPPORT_TICKET)
  async updateSupportTicket(@Payload() data: any) {
    return this.adminService.updateSupportTicket(data.id, data.status);
  }

  // === FINANCE ===
  @MessagePattern(ADMIN_PATTERNS.GET_EARNINGS)
  async getEarnings() {
    return this.adminService.getProviderEarnings();
  }

  @MessagePattern(ADMIN_PATTERNS.GET_PAYOUTS)
  async getPayouts() {
    return this.adminService.getPayouts();
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_PAYOUT)
  async updatePayout(@Payload() data: any) {
    return this.adminService.updatePayout(data.id, data.status);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_REFUNDS)
  async getRefunds() {
    return this.adminService.getRefunds();
  }

  @EventPattern(ADMIN_PATTERNS.MARK_REFUND)
  async markRefund(@Payload() data: any) {
    return this.adminService.markRefund(data.id);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_FAILED_PAYMENTS)
  async getFailedPayments() {
    return this.adminService.getFailedPayments();
  }

  // === MARKETPLACE ===
  @MessagePattern(ADMIN_PATTERNS.CREATE_CATEGORY)
  async createCategory(@Payload() data: any) {
    return this.adminService.createCategory(data);
  }

  @EventPattern(ADMIN_PATTERNS.UPDATE_CATEGORY)
  async updateCategory(@Payload() data: any) {
    return this.adminService.updateCategory(data.id, data);
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
    return this.adminService.updateService(data.id, data);
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
    return this.adminService.updateServiceArea(data.id, data);
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
```

- [ ] **Commit**

```bash
git add apps/admin-service/src/admin.controller.ts
git commit -m "feat(admin): add all domain Kafka handlers to admin controller"
```

---

## Task 6: Extend Gateway Admin HTTP Controller

**Files:**
- Modify: `src/controllers/admin.controller.ts`

- [ ] **Replace the entire file** with:

```typescript
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

  // ── OPERATIONS ────────────────────────────────────────────
  @Get('v1/operations/ongoing')
  getOngoing() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_ONGOING, {}));
  }

  @Get('v1/operations/disputes')
  getDisputes() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_DISPUTES, {}));
  }

  @Patch('v1/operations/disputes/:id') @HttpCode(202)
  updateDispute(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_DISPUTE, { id, status });
    return { status: 'accepted' };
  }

  @Get('v1/operations/support')
  getSupportTickets() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_SUPPORT_TICKETS, {}));
  }

  @Patch('v1/operations/support/:id') @HttpCode(202)
  updateSupportTicket(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_SUPPORT_TICKET, { id, status });
    return { status: 'accepted' };
  }

  // ── FINANCE ───────────────────────────────────────────────
  @Get('v1/finance/earnings')
  getEarnings() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_EARNINGS, {}));
  }

  @Get('v1/finance/payouts')
  getPayouts() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_PAYOUTS, {}));
  }

  @Patch('v1/finance/payouts/:id') @HttpCode(202)
  updatePayout(@Param('id') id: string, @Body('status') status: string) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_PAYOUT, { id, status });
    return { status: 'accepted' };
  }

  @Get('v1/finance/refunds')
  getRefunds() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_REFUNDS, {}));
  }

  @Patch('v1/finance/refunds/:id') @HttpCode(202)
  markRefund(@Param('id') id: string) {
    this.kafka.emit(ADMIN_PATTERNS.MARK_REFUND, { id });
    return { status: 'accepted' };
  }

  @Get('v1/finance/failed')
  getFailedPayments() {
    return lastValueFrom(this.kafka.send(ADMIN_PATTERNS.GET_FAILED_PAYMENTS, {}));
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
```

- [ ] **Commit**

```bash
git add src/controllers/admin.controller.ts
git commit -m "feat(admin): add all new HTTP routes to gateway admin controller"
```

---

## Task 7: Create Pending Endpoints Doc

**Files:**
- Create: `docs/admin-pending-endpoints.md`

- [ ] **Create the file** with the following content:

```markdown
# Admin Endpoints Requiring New Supabase Tables

These frontend pages were identified as missing from the admin panel but cannot be implemented
until the corresponding Supabase tables/schemas are created.

---

## ACCOUNT

### Settings
- **Page:** Admin account settings (theme, language, preferences)
- **Needs:** A new `admin_settings` table (or a generic `app_config` key-value store)
- **Proposed endpoints:**
  - `GET /api/admin/v1/account/settings`
  - `PATCH /api/admin/v1/account/settings`

### Activity Log
- **Page:** Admin's own recent actions
- **Needs:** A new `audit_log` table with columns: `id`, `user_id`, `action`, `resource`, `resource_id`, `metadata`, `created_at`
- **Proposed endpoints:**
  - `GET /api/admin/v1/account/activity-log`

---

## MARKETPLACE & MARKETING

### Promotions
- **Page:** Create and manage discount/promo campaigns
- **Needs:** A new `promotions` table with columns: `id`, `title`, `description`, `discount_type` (flat/percent), `discount_value`, `applicable_to` (category/service/provider), `start_date`, `end_date`, `is_active`, `created_at`
- **Proposed endpoints:**
  - `GET /api/admin/v1/marketplace/promotions`
  - `POST /api/admin/v1/marketplace/promotions`
  - `PATCH /api/admin/v1/marketplace/promotions/:id`
  - `DELETE /api/admin/v1/marketplace/promotions/:id`

---

## PLATFORM SETTINGS

### Commission
- **Page:** Set platform commission rate per booking/payment
- **Needs:** A new `platform_config` table (key-value) or dedicated `commission_settings` table
- **Proposed endpoints:**
  - `GET /api/admin/v1/settings/commission`
  - `PATCH /api/admin/v1/settings/commission`

### Admin Roles & Permissions
- **Page:** Manage admin users and their permission scopes
- **Needs:** New tables: `admin_roles` (`id`, `name`, `permissions` jsonb) and `admin_role_assignments` (`user_id`, `role_id`)
- **Proposed endpoints:**
  - `GET /api/admin/v1/settings/roles`
  - `POST /api/admin/v1/settings/roles`
  - `PATCH /api/admin/v1/settings/roles/:id`
  - `DELETE /api/admin/v1/settings/roles/:id`
  - `POST /api/admin/v1/settings/roles/assign`

### Security Settings
- **Page:** Password policies, session timeouts, 2FA enforcement
- **Needs:** A `platform_config` key-value table
- **Proposed endpoints:**
  - `GET /api/admin/v1/settings/security`
  - `PATCH /api/admin/v1/settings/security`

### Notification Settings
- **Page:** Configure which system events trigger notifications and their templates
- **Needs:** A `notification_config` table with columns: `id`, `event_type`, `channels` (email/push/in-app), `template`, `is_enabled`
- **Proposed endpoints:**
  - `GET /api/admin/v1/settings/notifications`
  - `PATCH /api/admin/v1/settings/notifications/:id`

### Logs & Audit Trail
- **Page:** System-wide audit log of all admin actions
- **Needs:** A `audit_log` table (same as Activity Log above, shared table)
- **Proposed endpoints:**
  - `GET /api/admin/v1/settings/logs?from=&to=&user_id=&action=`

### Integrations
- **Page:** Configure third-party integrations (payment gateways, SMS, email providers)
- **Needs:** A `integrations_config` table with columns: `id`, `name`, `provider`, `credentials` (encrypted jsonb), `is_active`
- **Proposed endpoints:**
  - `GET /api/admin/v1/settings/integrations`
  - `PATCH /api/admin/v1/settings/integrations/:id`
```

- [ ] **Commit**

```bash
git add docs/admin-pending-endpoints.md
git commit -m "docs: add admin pending endpoints requiring new Supabase tables"
```

---

## Task 8: Update API-Endpoints.md

**Files:**
- Modify: `API-Endpoints.md`

- [ ] **Append the following section** to the end of `API-Endpoints.md`, before the Architecture Notes:

```markdown
---

## Admin — `api/admin` (Extended)

All endpoints require auth. Endpoints marked **(async)** return `{ "status": "accepted" }` with HTTP 202.

### User Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/v1/users/customers?page=&limit=` | Paginated list of customers with profile data |
| GET | `/api/admin/v1/users/customers/:id` | Customer detail (user + profile + booking count) |
| PATCH | `/api/admin/v1/users/customers/:id/status` | Suspend/activate/ban a customer **(async)** |
| GET | `/api/admin/v1/users/reviews?page=&limit=` | Paginated list of all reviews |
| DELETE | `/api/admin/v1/users/reviews/:id` | Remove a review **(async)** |

### Account

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/v1/account/profile` | Get admin's own profile |
| PATCH | `/api/admin/v1/account/profile` | Update admin's own profile **(async)** |

### Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/v1/operations/ongoing` | Active bookings (confirmed + in_progress) |
| GET | `/api/admin/v1/operations/disputes` | All disputes |
| PATCH | `/api/admin/v1/operations/disputes/:id` | Update dispute status **(async)** |
| GET | `/api/admin/v1/operations/support` | All support tickets |
| PATCH | `/api/admin/v1/operations/support/:id` | Update support ticket status **(async)** |

### Finance

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/v1/finance/earnings` | All completed provider payments |
| GET | `/api/admin/v1/finance/payouts` | All payout records |
| PATCH | `/api/admin/v1/finance/payouts/:id` | Approve or reject a payout **(async)** |
| GET | `/api/admin/v1/finance/refunds` | Payments with status refunded or cancelled |
| PATCH | `/api/admin/v1/finance/refunds/:id` | Mark a payment as refunded **(async)** |
| GET | `/api/admin/v1/finance/failed` | Payments with status failed |

### Marketplace & Marketing

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/v1/marketplace/categories` | Create a service category |
| PATCH | `/api/admin/v1/marketplace/categories/:id` | Update a category **(async)** |
| DELETE | `/api/admin/v1/marketplace/categories/:id` | Delete a category **(async)** |
| GET | `/api/admin/v1/marketplace/services?page=&limit=` | All services (unfiltered admin view) |
| PATCH | `/api/admin/v1/marketplace/services/:id` | Update a service listing **(async)** |
| DELETE | `/api/admin/v1/marketplace/services/:id` | Remove a service listing **(async)** |
| GET | `/api/admin/v1/marketplace/service-areas` | All service areas |
| POST | `/api/admin/v1/marketplace/service-areas` | Create a service area |
| PATCH | `/api/admin/v1/marketplace/service-areas/:id` | Update a service area **(async)** |
| DELETE | `/api/admin/v1/marketplace/service-areas/:id` | Delete a service area **(async)** |
| POST | `/api/admin/v1/marketplace/broadcasts` | Send notification broadcast to users **(async)** |

**Broadcast request body:**
```json
{
  "title": "",
  "message": "",
  "type": "broadcast",
  "role": "customer|provider",
  "user_ids": ["optional-array-of-specific-user-ids"]
}
```

### Reports & Analytics

All support optional `?from=YYYY-MM-DD&to=YYYY-MM-DD` date filters.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/v1/reports/revenue` | Total revenue, platform fees, net to providers |
| GET | `/api/admin/v1/reports/bookings` | Booking counts by status |
| GET | `/api/admin/v1/reports/business` | Combined overview: users, bookings, revenue |
| GET | `/api/admin/v1/reports/financial` | Full payments + payouts breakdown |
| GET | `/api/admin/v1/reports/users` | User totals by role and status |
| GET | `/api/admin/v1/reports/performance` | Provider ratings, review counts, trust scores |
| GET | `/api/admin/v1/reports/compliance` | Disputes and provider profile reports |
```

- [ ] **Commit**

```bash
git add API-Endpoints.md
git commit -m "docs: add new admin endpoints to API-Endpoints.md"
```
