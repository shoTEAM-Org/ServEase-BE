# ServEase API Endpoints

Base URL: `http://localhost:5000`

All protected endpoints require a `Bearer <token>` in the `Authorization` header.
The token is a Supabase access token obtained from login or registration.

> **Note on async endpoints:** Endpoints marked **(async)** use Kafka `emit` (fire-and-forget) and return `{ "status": "accepted" }` with HTTP 202. They do not return the operation result directly.

> **Status legend:**
> - `OK` — implemented and backed by real DB queries
> - `stub` — endpoint is wired but the service returns hardcoded/empty data; backing table(s) not yet created in Supabase
> - `needs-table` — service logic is fully written but references a table not yet confirmed to exist in the backend Supabase project; will fail at runtime until the table is created

---

## Auth — `api/auth`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | `/api/auth/v1/register/customer` | No | OK | Register a new customer account |
| POST | `/api/auth/v1/login` | No | OK | Login with email/phone + password |
| POST | `/api/auth/v2/register` | No | OK | Register a provider (multipart — includes `document_file`) |
| POST | `/api/auth/v1/refresh` | No | OK | Refresh access token using a refresh token |
| GET | `/api/auth/v1/me` | Yes | OK | Get the current authenticated user |
| POST | `/api/auth/v1/logout` | Yes | OK | Sign out the current session **(async)** |
| POST | `/api/auth/v1/forgot-password` | No | OK | Request a password-reset email **(async)** |
| POST | `/api/auth/v1/reset-password` | No | OK | Reset password with token from email **(async)** |

### Request Bodies

**POST /register/customer**
```json
{ "full_name": "", "email": "", "password": "", "contact_number": "", "role": "customer" }
```

**POST /login**
```json
{ "email": "email-or-phone", "password": "" }
```

**POST /v2/register** (multipart/form-data)
Fields: `full_name`, `email`, `password`, `contact_number`, `role`, `business_name`, `document_type`, `date_of_birth`, `document_file` (file)

**POST /refresh**
```json
{ "refresh_token": "" }
```

**POST /forgot-password**
```json
{ "email": "", "redirect_to": "optional-url" }
```

**POST /reset-password**
```json
{ "password": "", "access_token": "", "refresh_token": "", "code": "", "token_hash": "", "type": "" }
```

---

## Users — `api/users`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/users/v1/profile` | Yes | OK | Get authenticated user's profile |
| PATCH | `/api/users/v1/profile` | Yes | OK | Update user profile (full_name, contact_number, date_of_birth) **(async)** |
| GET | `/api/users/v1/customer-profile` | Yes | OK | Get customer profile |
| PATCH | `/api/users/v1/customer-profile` | Yes | OK | Update customer profile **(async)** |
| GET | `/api/users/v1/addresses` | Yes | OK | List user addresses |
| POST | `/api/users/v1/addresses` | Yes | OK | Add a new address **(async)** |
| PATCH | `/api/users/v1/addresses/:id` | Yes | OK | Update an address **(async)** |
| DELETE | `/api/users/v1/addresses/:id` | Yes | OK | Delete an address **(async)** |

---

## Booking — `api/booking`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | `/api/booking/v1/create` | Yes | OK | Create a new booking |
| GET | `/api/booking/v1/customer` | Yes | OK | Get authenticated customer's bookings |
| GET | `/api/booking/v1/history` | Yes | OK | Get completed/cancelled/disputed bookings |
| GET | `/api/booking/v1/requests` | Yes | OK | Get pending booking requests (provider view) |
| GET | `/api/booking/v1/:id` | Yes | OK | Get a single booking by ID |
| PATCH | `/api/booking/v1/:id/status` | Yes | OK | Update booking status **(async)** |
| PATCH | `/api/booking/v1/:id/cancel` | Yes | OK | Cancel a booking (with reason + explanation) **(async)** |
| GET | `/api/booking/v1/:id/attachments` | Yes | OK | Get booking attachments |
| POST | `/api/booking/v1/:id/attachments` | Yes | OK | Save booking attachment records **(async)** |
| POST | `/api/booking/v1/:id/disputes` | Yes | OK | Create a dispute for a booking **(async)** |

### Request Bodies

**POST /create**
```json
{
  "provider_id": "", "service_id": "", "service_address": "",
  "service_location_type": "mobile|in_shop", "scheduled_at": "ISO-8601",
  "pricing_mode": "flat|hourly", "hourly_rate": 0, "flat_rate": 0,
  "hours_required": 1, "payment_method": "cash_on_service"
}
```

**PATCH /:id/cancel**
```json
{ "reason": "", "explanation": "" }
```

---

## Chat — `api/chat`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/chat/v1/conversations?role=customer\|provider` | Yes | OK | List chat conversation summaries |
| GET | `/api/chat/v1/conversations/:bookingId/messages` | Yes | OK | Get messages for a booking conversation |
| POST | `/api/chat/v1/conversations/:bookingId/messages` | Yes | OK | Send a message in a booking conversation |
| PATCH | `/api/chat/v1/conversations/:bookingId/read` | Yes | OK | Mark conversation messages as read **(async)** |

---

## Payments — `api/payments`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | `/api/payments/v1/create` | Yes | OK | Create a payment record |
| GET | `/api/payments/v1/earnings/:provider_id` | Yes | OK | Get total earnings for a provider |
| GET | `/api/payments/v1/booking/:bookingId` | Yes | OK | Get payment for a specific booking |
| GET | `/api/payments/v1/provider/history` | Yes | OK | Get provider's payment history with details |
| GET | `/api/payments/v1/provider/earnings-summary` | Yes | OK | Get provider earnings summary and stats |
| POST | `/api/payments/v1/booking/ensure` | Yes | OK | Ensure a payment exists for a booking (upsert) |
| PATCH | `/api/payments/v1/booking/mark-paid` | Yes | OK | Mark a booking payment as paid **(async)** |
| PATCH | `/api/payments/v1/booking/:bookingId/cancel` | Yes | OK | Cancel a booking payment **(async)** |
| PATCH | `/api/payments/v1/booking/:bookingId/amount` | Yes | OK | Update payment amount for a booking **(async)** |

---

## Provider — `api/provider`

### Discovery & Profile

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/provider/v1?serviceId=X` | No | OK | Get providers by service category |
| GET | `/api/provider/v1?search=X` | No | OK | Search providers by keyword |
| GET | `/api/provider/v1/:user_id` | No | OK | Get provider profile with documents |
| GET | `/api/provider/v1/dashboard/:id` | Yes | OK | Get provider dashboard (jobs + earnings) |
| GET | `/api/provider/v1/trust-score/:provider_id` | No | OK | Get provider trust score |
| GET | `/api/provider/v1/reviews/:id` | No | OK | Get provider reviews and ratings |
| PATCH | `/api/provider/v1/kyc/reupload` | Yes | OK | Reupload KYC document (multipart) **(async)** |

### Provider Bookings

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/provider/v1/bookings` | Yes | OK | Get all bookings for authenticated provider |
| GET | `/api/provider/v1/booking/:id` | Yes | OK | Get a specific booking (provider view) |
| PATCH | `/api/provider/v1/booking/:id/status` | Yes | OK | Update booking status (confirm, start, complete, cancel) **(async)** |

### Availability

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/provider/v1/:id/availability` | No | OK | Get weekly schedule and days off |
| PUT | `/api/provider/v1/availability` | Yes | OK | Save weekly schedule and days off **(async)** |
| GET | `/api/provider/v1/:id/reserved-slots?date=YYYY-MM-DD` | No | OK | Get reserved time slots for a date |
| GET | `/api/provider/v1/:id/availability/check?scheduled_at=&hours_required=` | No | OK | Check if a time slot is available |

### Provider Services (Catalog)

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/provider/v1/my-services` | Yes | OK | Get authenticated provider's service listings |
| POST | `/api/provider/v1/my-services` | Yes | OK | Create a new service listing **(async)** |
| PATCH | `/api/provider/v1/my-services/:serviceId` | Yes | OK | Update a service listing **(async)** |
| DELETE | `/api/provider/v1/my-services/:serviceId` | Yes | OK | Delete a service listing **(async)** |

### Profile Draft

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/provider/v1/:id/profile-draft` | No | OK | Get provider profile draft |
| PATCH | `/api/provider/v1/:id/profile-draft` | No | OK | Save/update provider profile draft **(async)** |

### Reschedule Requests

> These endpoints are fully implemented in service code but require `booking_reschedule_requests` in the backend `booking` schema. See [Missing-Tables.md](docs/Missing-Tables.md).

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | `/api/provider/v1/reschedule-requests` | Yes | needs-table | Create a reschedule request **(async)** |
| GET | `/api/provider/v1/reschedule-requests/:bookingId` | Yes | needs-table | Get reschedule requests for a booking |
| PATCH | `/api/provider/v1/reschedule-requests/:requestId/review` | Yes | needs-table | Approve or decline a reschedule request **(async)** |

### Additional Charges

> These endpoints are fully implemented in service code but require `additional_charges` in the backend `booking` schema. See [Missing-Tables.md](docs/Missing-Tables.md).

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | `/api/provider/v1/additional-charges` | Yes | needs-table | Submit additional charge items **(async)** |
| GET | `/api/provider/v1/additional-charges/:bookingId` | Yes | needs-table | Get additional charges for a booking |
| PATCH | `/api/provider/v1/additional-charges/review` | Yes | needs-table | Approve or decline additional charges **(async)** |

### Reviews & Reports

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | `/api/provider/v1/reviews` | Yes | OK | Submit a provider review **(async)** |
| POST | `/api/provider/v1/reports` | Yes | OK | Submit a provider profile report **(async)** |

---

## Customer — `api/customer`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/customer/v1/dashboard/:id` | Yes | OK | Get customer dashboard (pending + completed bookings) |
| GET | `/api/customer/v1/profile` | Yes | OK | Get customer profile |
| PATCH | `/api/customer/v1/profile` | Yes | OK | Update customer profile **(async)** |

---

## Admin — `api/admin`

All endpoints require auth (`Bearer <token>`). Endpoints marked **(async)** use Kafka `emit` and return `{ "status": "accepted" }` with HTTP 202.

### KYC Documents

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| PATCH | `/api/admin/v2/documents/status/:id` | Yes | OK | Approve or reject a KYC document **(async)** |

**Request body:**
```json
{ "status": "approved|rejected", "reject_reason": "required if rejected", "admin_id": "optional" }
```

### User Management

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/admin/v1/users/customers?page=&limit=` | Yes | OK | Paginated list of customers |
| GET | `/api/admin/v1/users/customers/:id` | Yes | OK | Customer detail (user + profile + booking count) |
| PATCH | `/api/admin/v1/users/customers/:id/status` | Yes | OK | Suspend/activate/ban a customer **(async)** |
| GET | `/api/admin/v1/users/reviews?page=&limit=` | Yes | OK | Paginated list of all reviews |
| DELETE | `/api/admin/v1/users/reviews/:id` | Yes | OK | Remove a review **(async)** |

### Account

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/admin/v1/account/profile` | Yes | OK | Get admin's own profile |
| PATCH | `/api/admin/v1/account/profile` | Yes | OK | Update admin's own profile **(async)** |
| GET | `/api/admin/v1/account/settings` | Yes | stub | Get admin preferences (language, timezone, theme, notification toggles) — needs `admin_settings` table |
| PATCH | `/api/admin/v1/account/settings` | Yes | stub | Update admin preferences **(async)** — needs `admin_settings` table |
| GET | `/api/admin/v1/account/activity-log?page=&limit=&from=&to=` | Yes | stub | Paginated list of actions performed by the current admin — needs `audit_log` table |

### Operations

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/admin/v1/operations/ongoing` | Yes | OK | Active bookings (confirmed + in_progress) with provider/customer names |
| GET | `/api/admin/v1/operations/disputes?page=&limit=` | Yes | OK | Paginated list of all disputes |
| PATCH | `/api/admin/v1/operations/disputes/:id` | Yes | OK | Update dispute status **(async)** |
| GET | `/api/admin/v1/operations/support?page=&limit=` | Yes | OK | Paginated list of all support tickets |
| PATCH | `/api/admin/v1/operations/support/:id` | Yes | OK | Update support ticket status **(async)** |

### Finance

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/admin/v1/finance/earnings?page=&limit=` | Yes | OK | Paginated completed provider payments |
| GET | `/api/admin/v1/finance/payouts?page=&limit=` | Yes | OK | Paginated provider payout records |
| PATCH | `/api/admin/v1/finance/payouts/:id` | Yes | OK | Approve or reject a payout **(async)** |
| GET | `/api/admin/v1/finance/refunds?page=&limit=` | Yes | OK | Paginated refunded/cancelled payments |
| PATCH | `/api/admin/v1/finance/refunds/:id` | Yes | OK | Mark a payment as refunded **(async)** |
| GET | `/api/admin/v1/finance/failed?page=&limit=` | Yes | OK | Paginated failed payments |

### Marketplace & Marketing

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | `/api/admin/v1/marketplace/categories` | Yes | OK | Create a service category |
| PATCH | `/api/admin/v1/marketplace/categories/:id` | Yes | OK | Update a category **(async)** |
| DELETE | `/api/admin/v1/marketplace/categories/:id` | Yes | OK | Delete a category **(async)** |
| GET | `/api/admin/v1/marketplace/services?page=&limit=` | Yes | OK | All service listings (unfiltered admin view) |
| PATCH | `/api/admin/v1/marketplace/services/:id` | Yes | OK | Update a service listing **(async)** |
| DELETE | `/api/admin/v1/marketplace/services/:id` | Yes | OK | Remove a service listing **(async)** |
| GET | `/api/admin/v1/marketplace/service-areas` | Yes | OK | All service areas |
| POST | `/api/admin/v1/marketplace/service-areas` | Yes | OK | Create a service area |
| PATCH | `/api/admin/v1/marketplace/service-areas/:id` | Yes | OK | Update a service area **(async)** |
| DELETE | `/api/admin/v1/marketplace/service-areas/:id` | Yes | OK | Delete a service area **(async)** |
| POST | `/api/admin/v1/marketplace/broadcasts` | Yes | OK | Send notification broadcast to users **(async)** |
| GET | `/api/admin/v1/marketplace/promotions?page=&limit=&status=&type=&search=` | Yes | stub | Paginated list of promotions with filters — needs `promotions` table |
| POST | `/api/admin/v1/marketplace/promotions` | Yes | stub | Create a promotion — needs `promotions` table |
| PATCH | `/api/admin/v1/marketplace/promotions/:id` | Yes | stub | Update a promotion **(async)** — needs `promotions` table |
| DELETE | `/api/admin/v1/marketplace/promotions/:id` | Yes | stub | Remove a promotion **(async)** — needs `promotions` table |

**Broadcast request body:**
```json
{
  "title": "",
  "message": "",
  "type": "broadcast",
  "role": "customer|provider (send to all users of this role)",
  "user_ids": ["optional array of specific user IDs"]
}
```

### Platform Settings

> All settings endpoints below are **stubs** — the backing tables (`admin_settings`, `audit_log`, `admin_roles`, `notification_config`, `integrations_config`, `platform_config`) have not yet been created in Supabase. See [Missing-Tables.md](docs/Missing-Tables.md) for the full table schema.

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/admin/v1/settings/commission` | Yes | stub | Read platform commission config — needs `platform_config` table |
| PATCH | `/api/admin/v1/settings/commission` | Yes | stub | Update commission config **(async)** — needs `platform_config` table |
| GET | `/api/admin/v1/settings/roles?page=&limit=` | Yes | stub | List admin roles and permissions — needs `admin_roles` table |
| POST | `/api/admin/v1/settings/roles` | Yes | stub | Create a role — needs `admin_roles` table |
| PATCH | `/api/admin/v1/settings/roles/:id` | Yes | stub | Update a role **(async)** — needs `admin_roles` table |
| DELETE | `/api/admin/v1/settings/roles/:id` | Yes | stub | Delete a role **(async)** — needs `admin_roles` table |
| POST | `/api/admin/v1/settings/roles/assign` | Yes | stub | Assign a role to an admin user **(async)** — needs `admin_role_assignments` table |
| GET | `/api/admin/v1/settings/security` | Yes | stub | Load platform security policy — needs `platform_config` table |
| PATCH | `/api/admin/v1/settings/security` | Yes | stub | Update platform security policy **(async)** — needs `platform_config` table |
| GET | `/api/admin/v1/settings/notifications?page=&limit=` | Yes | stub | List system notification rules/templates — needs `notification_config` table |
| PATCH | `/api/admin/v1/settings/notifications/:id` | Yes | stub | Update a notification rule/template **(async)** — needs `notification_config` table |
| GET | `/api/admin/v1/settings/logs?page=&limit=&from=&to=&user_id=&action=` | Yes | stub | System-wide audit trail — needs `audit_log` table |
| GET | `/api/admin/v1/settings/integrations` | Yes | stub | List integration configs and health state — needs `integrations_config` table |
| PATCH | `/api/admin/v1/settings/integrations/:id` | Yes | stub | Update an integration config **(async)** — needs `integrations_config` table |

**Commission PATCH request body:**
```json
{
  "default_commission_rate": 0.18,
  "category_overrides": [{ "category_id": "CAT-001", "commission_rate": 0.2 }]
}
```

**Role assign POST request body:**
```json
{ "user_id": "admin-user-id", "role_id": "role-id" }
```

**Security PATCH request body:**
```json
{ "require_2fa": true, "session_timeout_minutes": 30, "ip_whitelist_enabled": false, "ip_whitelist": [] }
```

### Reports & Analytics

All report endpoints accept optional `?from=YYYY-MM-DD&to=YYYY-MM-DD` query params.

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/admin/v1/reports/revenue` | Yes | OK | Total revenue, platform fees, net to providers |
| GET | `/api/admin/v1/reports/bookings` | Yes | OK | Booking counts by status |
| GET | `/api/admin/v1/reports/business` | Yes | OK | Combined revenue + booking + user overview |
| GET | `/api/admin/v1/reports/financial` | Yes | OK | All payments and payouts in range |
| GET | `/api/admin/v1/reports/users` | Yes | OK | User counts by role and status |
| GET | `/api/admin/v1/reports/performance` | Yes | OK | Provider ratings and trust scores |
| GET | `/api/admin/v1/reports/compliance` | Yes | OK | Disputes and provider profile reports |

---

## Catalog / Services — `api/services`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/services/v1` | No | OK | Get all services (with verified providers) |
| GET | `/api/services/v2/search?keyword=X` | No | OK | Search services by category keyword |
| GET | `/api/services/v1/categories` | No | OK | Get active service categories |
| GET | `/api/services/v1/categories/:categoryName/services` | No | OK | Get services in a category |
| GET | `/api/services/v1/providers/:serviceName` | No | OK | Get providers offering a service |
| GET | `/api/services/v1/provider/:providerId/services` | No | OK | Get a provider's service listings |
| GET | `/api/services/v1/provider-profile/:providerId` | No | OK | Get a provider's public profile data |

## Reference — `api/reference`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/reference/v1/categories` | No | OK | Get active service categories (alias) |

---

## Locations — `api/locations`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/locations/v1` | No | OK | Get all locations |
| GET | `/api/locations/v1/provinces` | No | OK | Get all provinces |
| GET | `/api/locations/v1/provinces/:provinceCode/cities` | No | OK | Get cities in a province |
| GET | `/api/locations/v1/cities/:cityCode/barangays` | No | OK | Get barangays in a city |

---

## Notifications — `api/notifications`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| GET | `/api/notifications/v1` | Yes | OK | Get all notifications for authenticated user |
| PATCH | `/api/notifications/v1/read-all` | Yes | OK | Mark all notifications as read **(async)** |
| GET | `/api/notifications/v1/unread-count` | Yes | OK | Get count of unread notifications |
| PATCH | `/api/notifications/v1/:id/read` | Yes | OK | Mark a single notification as read **(async)** |

---

## Support — `api/support`

| Method | Path | Auth | Status | Description |
|--------|------|------|--------|-------------|
| POST | `/api/support/v1/tickets` | Yes | OK | Create a support ticket **(async)** |

### Request Body

```json
{ "subject": "", "message": "", "category": "general", "role": "customer|provider" }
```

---

## Architecture Notes

- **Framework**: NestJS monorepo — microservice logic lives in `apps/` (e.g. `apps/auth-service/`, `apps/booking-service/`), gateway controllers in `src/controllers/`, shared code in `libs/`
- **Database**: Supabase (PostgreSQL) via `@supabase/supabase-js`
- **Auth**: Bearer tokens validated via Supabase Auth (`SupabaseAuthGuard`)
- **Messaging**: Kafka — request/response via `send`, fire-and-forget via `emit` (returns 202)
- **File Uploads**: Multer for multipart handling, stored in Supabase Storage
- **Validation**: `class-validator` DTOs with global `ValidationPipe`
- **Port**: 5000 (configurable via `PORT` env var)
