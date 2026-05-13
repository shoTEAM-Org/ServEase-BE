# Frontend Integration Guide

All ServEase clients talk to the NestJS gateway at `http://localhost:5000`
or the configured public gateway URL. Protected endpoints require a Supabase
access token in `Authorization: Bearer <token>`.

## Mobile

| Area | Gateway endpoints | Canonical backing |
|---|---|---|
| Auth | `/api/auth/v1/register/customer`, `/api/auth/v2/register`, `/api/auth/v1/login`, `/api/auth/v1/me` | `identity_and_user.users`, `customer_profiles`, `provider_profiles`, `provider_documents` |
| Addresses | `/api/users/v1/addresses` | `identity_and_user.user_addresses` using `address_line` |
| Discovery | `/api/services/v1/categories`, `/api/provider/v1?serviceId=...`, `/api/services/v1/provider/:providerId/services` | `provider_catalog.service_categories`, `provider_services` |
| Booking | `/api/booking/v1/create`, `/api/booking/v1/:id`, `/api/booking/v1/:id/cancel` | `booking.bookings`, `bookings_cancellations` |
| Availability | `/api/provider/v1/:id/availability`, `/api/provider/v1/:id/reserved-slots`, `/api/provider/v1/:id/availability/check` | `booking.provider_availability`, `provider_days_off`, `bookings` |
| Payments | `/api/payments/v1/booking/ensure`, `/api/payments/v1/booking/mark-paid`, `/api/payments/v1/provider/history`, `/api/payments/v1/provider/earnings-summary` | `payment.payments`, `provider_payouts` |
| Chat | `/api/chat/v1/conversations`, `/api/chat/v1/conversations/:bookingId/messages`, `/api/chat/v1/conversations/:bookingId/read` | `messages.conversations`, `messages.messages` |
| Notifications | `/api/notifications/v1`, `/api/notifications/v1/unread-count`, `/api/notifications/v1/:id/read`, `/api/notifications/v1/read-all` | `notification_and_support.notifications` using `is_read` |
| Support and trust | `/api/support/v1/tickets`, `/api/booking/v1/:id/disputes`, `/api/provider/v1/reviews`, `/api/provider/v1/reports` | `support_tickets`, `disputes`, `reviews`, `provider_profile_reports` |

Provider service rows use only the DB-backed payload:

```json
{
  "service_id": "category uuid",
  "title": "Aircon Cleaning",
  "description": "Optional details",
  "pricing_mode": "hourly",
  "price": 700,
  "duration_minutes": 60,
  "is_active": true
}
```

Booking create requests may still send `pricing_mode`, `hourly_rate`, and
`flat_rate` as request-only fields. The booking-service translates those into
`service_amount`, `hours_required`, and `total_amount`; the database does not
store pricing-mode columns on `booking.bookings`.

## Provider Web

Provider web should stay inside provider, booking, payment, chat, notification,
support, and trust surfaces:

| Page group | Gateway endpoints |
|---|---|
| Dashboard/bookings | `/api/provider/v1/dashboard/:id`, `/api/provider/v1/bookings`, `/api/provider/v1/booking/:id/status` |
| Calendar/availability | `/api/provider/v1/:id/availability`, `/api/provider/v1/availability` |
| Services/pricing | `/api/provider/v1/my-services` |
| Earnings/payouts | `/api/payments/v1/provider/history`, `/api/payments/v1/provider/earnings-summary` |
| Messages | `/api/chat/v1/conversations`, `/api/chat/v1/conversations/:bookingId/messages` |
| Reviews/help | `/api/provider/v1/reviews/:id`, `/api/support/v1/tickets` |

No provider web page should target portfolio, counter-offer, reschedule, or
notification-preference routes.

## Admin Web

Admin web is a read/manage console over the existing service schemas:

| Area | Gateway endpoints |
|---|---|
| Provider approvals | `/api/admin/v1/users/provider-applications`, `/api/admin/v2/documents/status/:id` |
| Bookings/operations | `/api/admin/v1/operations/ongoing`, `/api/admin/v1/operations/disputes`, `/api/admin/v1/operations/support` |
| Finance | `/api/admin/v1/finance/transactions`, `/api/admin/v1/finance/earnings`, `/api/admin/v1/finance/payouts`, `/api/admin/v1/finance/failed` |
| Catalog | `/api/admin/v1/marketplace/categories`, `/api/admin/v1/marketplace/services`, `/api/admin/v1/marketplace/service-areas` |
| Reports | `/api/admin/v1/reports/revenue`, `/api/admin/v1/reports/bookings`, `/api/admin/v1/reports/business`, `/api/admin/v1/reports/financial`, `/api/admin/v1/reports/users`, `/api/admin/v1/reports/performance`, `/api/admin/v1/reports/compliance` |

Removed admin surfaces include unrelated verticals, commission rules, refund
policy management, promotions, live ops, statements, security settings, and
generic platform settings.
