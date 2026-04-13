# ServEase API Endpoints

Base URL: `http://localhost:5000`

All protected endpoints require a `Bearer <token>` in the `Authorization` header.
The token is a Supabase access token obtained from login or registration.

> **Note on async endpoints:** Endpoints marked **(async)** use Kafka `emit` (fire-and-forget) and return `{ "status": "accepted" }` with HTTP 202. They do not return the operation result directly.

---

## Auth — `api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/v1/register/customer` | No | Register a new customer account |
| POST | `/api/auth/v1/login` | No | Login with email/phone + password |
| POST | `/api/auth/v2/register` | No | Register a provider (multipart — includes `document_file`) |
| POST | `/api/auth/v1/refresh` | No | Refresh access token using a refresh token |
| GET | `/api/auth/v1/me` | Yes | Get the current authenticated user |
| POST | `/api/auth/v1/logout` | Yes | Sign out the current session **(async)** |
| POST | `/api/auth/v1/forgot-password` | No | Request a password-reset email **(async)** |
| POST | `/api/auth/v1/reset-password` | No | Reset password with token from email **(async)** |

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

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users/v1/profile` | Yes | Get authenticated user's profile |
| PATCH | `/api/users/v1/profile` | Yes | Update user profile (full_name, contact_number, date_of_birth) **(async)** |
| GET | `/api/users/v1/customer-profile` | Yes | Get customer profile |
| PATCH | `/api/users/v1/customer-profile` | Yes | Update customer profile **(async)** |
| GET | `/api/users/v1/addresses` | Yes | List user addresses |
| POST | `/api/users/v1/addresses` | Yes | Add a new address **(async)** |
| PATCH | `/api/users/v1/addresses/:id` | Yes | Update an address **(async)** |
| DELETE | `/api/users/v1/addresses/:id` | Yes | Delete an address **(async)** |

---

## Booking — `api/booking`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/booking/v1/create` | Yes | Create a new booking |
| GET | `/api/booking/v1/customer` | Yes | Get authenticated customer's bookings |
| GET | `/api/booking/v1/history` | Yes | Get completed/cancelled/disputed bookings |
| GET | `/api/booking/v1/requests` | Yes | Get pending booking requests (provider view) |
| GET | `/api/booking/v1/:id` | Yes | Get a single booking by ID |
| PATCH | `/api/booking/v1/:id/status` | Yes | Update booking status **(async)** |
| PATCH | `/api/booking/v1/:id/cancel` | Yes | Cancel a booking (with reason + explanation) **(async)** |
| GET | `/api/booking/v1/:id/attachments` | Yes | Get booking attachments |
| POST | `/api/booking/v1/:id/attachments` | Yes | Save booking attachment records **(async)** |
| POST | `/api/booking/v1/:id/disputes` | Yes | Create a dispute for a booking **(async)** |

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

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/chat/v1/conversations?role=customer\|provider` | Yes | List chat conversation summaries |
| GET | `/api/chat/v1/conversations/:bookingId/messages` | Yes | Get messages for a booking conversation |
| POST | `/api/chat/v1/conversations/:bookingId/messages` | Yes | Send a message in a booking conversation |
| PATCH | `/api/chat/v1/conversations/:bookingId/read` | Yes | Mark conversation messages as read **(async)** |

---

## Payments — `api/payments`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/payments/v1/create` | Yes | Create a payment record |
| GET | `/api/payments/v1/earnings/:provider_id` | Yes | Get total earnings for a provider |
| GET | `/api/payments/v1/booking/:bookingId` | Yes | Get payment for a specific booking |
| GET | `/api/payments/v1/provider/history` | Yes | Get provider's payment history with details |
| GET | `/api/payments/v1/provider/earnings-summary` | Yes | Get provider earnings summary and stats |
| POST | `/api/payments/v1/booking/ensure` | Yes | Ensure a payment exists for a booking (upsert) |
| PATCH | `/api/payments/v1/booking/mark-paid` | Yes | Mark a booking payment as paid **(async)** |
| PATCH | `/api/payments/v1/booking/:bookingId/cancel` | Yes | Cancel a booking payment **(async)** |
| PATCH | `/api/payments/v1/booking/:bookingId/amount` | Yes | Update payment amount for a booking **(async)** |

---

## Provider — `api/provider`

### Discovery & Profile

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/provider/v1?serviceId=X` | No | Get providers by service category |
| GET | `/api/provider/v1?search=X` | No | Search providers by keyword |
| GET | `/api/provider/v1/:user_id` | No | Get provider profile with documents |
| GET | `/api/provider/v1/dashboard/:id` | Yes | Get provider dashboard (jobs + earnings) |
| GET | `/api/provider/v1/trust-score/:provider_id` | No | Get provider trust score |
| GET | `/api/provider/v1/reviews/:id` | No | Get provider reviews and ratings |
| PATCH | `/api/provider/v1/kyc/reupload` | Yes | Reupload KYC document (multipart) **(async)** |

### Provider Bookings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/provider/v1/bookings` | Yes | Get all bookings for authenticated provider |
| GET | `/api/provider/v1/booking/:id` | Yes | Get a specific booking (provider view) |
| PATCH | `/api/provider/v1/booking/:id/status` | Yes | Update booking status (confirm, start, complete, cancel) **(async)** |

### Availability

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/provider/v1/:id/availability` | No | Get weekly schedule and days off |
| PUT | `/api/provider/v1/availability` | Yes | Save weekly schedule and days off **(async)** |
| GET | `/api/provider/v1/:id/reserved-slots?date=YYYY-MM-DD` | No | Get reserved time slots for a date |
| GET | `/api/provider/v1/:id/availability/check?scheduled_at=&hours_required=` | No | Check if a time slot is available |

### Provider Services (Catalog)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/provider/v1/my-services` | Yes | Get authenticated provider's service listings |
| POST | `/api/provider/v1/my-services` | Yes | Create a new service listing **(async)** |
| PATCH | `/api/provider/v1/my-services/:serviceId` | Yes | Update a service listing **(async)** |
| DELETE | `/api/provider/v1/my-services/:serviceId` | Yes | Delete a service listing **(async)** |

### Profile Draft

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/provider/v1/:id/profile-draft` | No | Get provider profile draft |
| PATCH | `/api/provider/v1/:id/profile-draft` | No | Save/update provider profile draft **(async)** |

### Reschedule Requests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/provider/v1/reschedule-requests` | Yes | Create a reschedule request **(async)** |
| GET | `/api/provider/v1/reschedule-requests/:bookingId` | Yes | Get reschedule requests for a booking |
| PATCH | `/api/provider/v1/reschedule-requests/:requestId/review` | Yes | Approve or decline a reschedule request **(async)** |

### Additional Charges

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/provider/v1/additional-charges` | Yes | Submit additional charge items **(async)** |
| GET | `/api/provider/v1/additional-charges/:bookingId` | Yes | Get additional charges for a booking |
| PATCH | `/api/provider/v1/additional-charges/review` | Yes | Approve or decline additional charges **(async)** |

### Reviews & Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/provider/v1/reviews` | Yes | Submit a provider review **(async)** |
| POST | `/api/provider/v1/reports` | Yes | Submit a provider profile report **(async)** |

---

## Customer — `api/customer`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/customer/v1/dashboard/:id` | Yes | Get customer dashboard (pending + completed bookings) |
| GET | `/api/customer/v1/profile` | Yes | Get customer profile |
| PATCH | `/api/customer/v1/profile` | Yes | Update customer profile **(async)** |

---

## Admin — `api/admin`

All endpoints require auth (`Bearer <token>`). Endpoints marked **(async)** use Kafka `emit` and return `{ "status": "accepted" }` with HTTP 202.

### KYC Documents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PATCH | `/api/admin/v2/documents/status/:id` | Yes | Approve or reject a KYC document **(async)** |

**Request body:**
```json
{ "status": "approved|rejected", "reject_reason": "required if rejected", "admin_id": "optional" }
```

### User Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/v1/users/customers?page=&limit=` | Yes | Paginated list of customers |
| GET | `/api/admin/v1/users/customers/:id` | Yes | Customer detail (user + profile + booking count) |
| PATCH | `/api/admin/v1/users/customers/:id/status` | Yes | Suspend/activate/ban a customer **(async)** |
| GET | `/api/admin/v1/users/reviews?page=&limit=` | Yes | Paginated list of all reviews |
| DELETE | `/api/admin/v1/users/reviews/:id` | Yes | Remove a review **(async)** |

### Account

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/v1/account/profile` | Yes | Get admin's own profile |
| PATCH | `/api/admin/v1/account/profile` | Yes | Update admin's own profile **(async)** |

### Operations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/v1/operations/ongoing` | Yes | Active bookings (confirmed + in_progress) with provider/customer names |
| GET | `/api/admin/v1/operations/disputes?page=&limit=` | Yes | Paginated list of all disputes |
| PATCH | `/api/admin/v1/operations/disputes/:id` | Yes | Update dispute status **(async)** |
| GET | `/api/admin/v1/operations/support?page=&limit=` | Yes | Paginated list of all support tickets |
| PATCH | `/api/admin/v1/operations/support/:id` | Yes | Update support ticket status **(async)** |

### Finance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/v1/finance/earnings?page=&limit=` | Yes | Paginated completed provider payments |
| GET | `/api/admin/v1/finance/payouts?page=&limit=` | Yes | Paginated provider payout records |
| PATCH | `/api/admin/v1/finance/payouts/:id` | Yes | Approve or reject a payout **(async)** |
| GET | `/api/admin/v1/finance/refunds?page=&limit=` | Yes | Paginated refunded/cancelled payments |
| PATCH | `/api/admin/v1/finance/refunds/:id` | Yes | Mark a payment as refunded **(async)** |
| GET | `/api/admin/v1/finance/failed?page=&limit=` | Yes | Paginated failed payments |

### Marketplace & Marketing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/admin/v1/marketplace/categories` | Yes | Create a service category |
| PATCH | `/api/admin/v1/marketplace/categories/:id` | Yes | Update a category **(async)** |
| DELETE | `/api/admin/v1/marketplace/categories/:id` | Yes | Delete a category **(async)** |
| GET | `/api/admin/v1/marketplace/services?page=&limit=` | Yes | All service listings (unfiltered admin view) |
| PATCH | `/api/admin/v1/marketplace/services/:id` | Yes | Update a service listing **(async)** |
| DELETE | `/api/admin/v1/marketplace/services/:id` | Yes | Remove a service listing **(async)** |
| GET | `/api/admin/v1/marketplace/service-areas` | Yes | All service areas |
| POST | `/api/admin/v1/marketplace/service-areas` | Yes | Create a service area |
| PATCH | `/api/admin/v1/marketplace/service-areas/:id` | Yes | Update a service area **(async)** |
| DELETE | `/api/admin/v1/marketplace/service-areas/:id` | Yes | Delete a service area **(async)** |
| POST | `/api/admin/v1/marketplace/broadcasts` | Yes | Send notification broadcast to users **(async)** |

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

### Reports & Analytics

All report endpoints accept optional `?from=YYYY-MM-DD&to=YYYY-MM-DD` query params.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/v1/reports/revenue` | Yes | Total revenue, platform fees, net to providers |
| GET | `/api/admin/v1/reports/bookings` | Yes | Booking counts by status |
| GET | `/api/admin/v1/reports/business` | Yes | Combined revenue + booking + user overview |
| GET | `/api/admin/v1/reports/financial` | Yes | All payments and payouts in range |
| GET | `/api/admin/v1/reports/users` | Yes | User counts by role and status |
| GET | `/api/admin/v1/reports/performance` | Yes | Provider ratings and trust scores |
| GET | `/api/admin/v1/reports/compliance` | Yes | Disputes and provider profile reports |

---

## Catalog / Services — `api/services`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/services/v1` | No | Get all services (with verified providers) |
| GET | `/api/services/v2/search?keyword=X` | No | Search services by category keyword |
| GET | `/api/services/v1/categories` | No | Get active service categories |
| GET | `/api/services/v1/categories/:categoryName/services` | No | Get services in a category |
| GET | `/api/services/v1/providers/:serviceName` | No | Get providers offering a service |
| GET | `/api/services/v1/provider/:providerId/services` | No | Get a provider's service listings |
| GET | `/api/services/v1/provider-profile/:providerId` | No | Get a provider's public profile data |

## Reference — `api/reference`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/reference/v1/categories` | No | Get active service categories (alias) |

---

## Locations — `api/locations`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/locations/v1` | No | Get all locations |
| GET | `/api/locations/v1/provinces` | No | Get all provinces |
| GET | `/api/locations/v1/provinces/:provinceCode/cities` | No | Get cities in a province |
| GET | `/api/locations/v1/cities/:cityCode/barangays` | No | Get barangays in a city |

---

## Notifications — `api/notifications`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notifications/v1` | Yes | Get all notifications for authenticated user |
| PATCH | `/api/notifications/v1/read-all` | Yes | Mark all notifications as read **(async)** |
| GET | `/api/notifications/v1/unread-count` | Yes | Get count of unread notifications |
| PATCH | `/api/notifications/v1/:id/read` | Yes | Mark a single notification as read **(async)** |

---

## Support — `api/support`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/support/v1/tickets` | Yes | Create a support ticket **(async)** |

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
