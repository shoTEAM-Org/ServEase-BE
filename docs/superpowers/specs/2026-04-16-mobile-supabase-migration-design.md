# Design Spec: Mobile Supabase Migration

**Date:** 2026-04-16  
**Scope:** Remove all direct Supabase communication from `ServEase-MB`. All data access goes through the `ServEase-BE` NestJS backend.  
**Repos affected:** `ServEase-MB` (primary), `ServEase-BE` (minor additions)  
**Web frontend (`ServEase-FE`) is not affected.**

---

## Background

The mobile app (`ServEase-MB`) was originally built with direct Supabase access. A `lib/apiClient.ts` HTTP client and backend endpoints were added later, and most service files were already migrated. This spec covers the remaining direct Supabase calls and the URL routing mismatch that must be resolved before any backend communication works.

---

## Section 1 — URL Routing Fix (Mobile only)

### Problem

`lib/apiClient.ts` constructs URLs as:
```
{EXPO_PUBLIC_API_URL}/api/v1/{path}
```
Example: `http://localhost:6000/api/v1/auth/login`

The backend actually serves:
```
{url}/api/{service}/v1/{action}
```
Example: `http://localhost:5000/api/auth/v1/login`

Two mismatches: wrong port default (6000 vs 5000) and wrong path structure (`/api/v1/auth/` vs `/api/auth/v1/`).

### Fix

- **`lib/apiClient.ts`**: Change BASE_URL suffix from `/api/v1` → `/api`. Change default port from `6000` → `5000`.
- **All mobile service files**: Update call paths to include the service prefix and version segment.

### Path mapping (before → after)

| File | Before | After |
|---|---|---|
| `authService.ts` | `/auth/register/customer` | `/auth/v1/register/customer` |
| `authService.ts` | `/auth/login` | `/auth/v1/login` |
| `authService.ts` | `/auth/refresh` | `/auth/v1/refresh` |
| `authService.ts` | `/auth/me` | `/auth/v1/me` |
| `authService.ts` | `/auth/logout` | `/auth/v1/logout` |
| `authService.ts` | `/auth/forgot-password` | `/auth/v1/forgot-password` |
| `authService.ts` | `/auth/reset-password` | `/auth/v1/reset-password` |
| `bookingService.ts` | `/booking/customer` | `/booking/v1/customer` |
| `bookingService.ts` | `/booking/history` | `/booking/v1/history` |
| `bookingService.ts` | `/booking/create` | `/booking/v1/create` |
| `bookingService.ts` | `/booking/:id` | `/booking/v1/:id` |
| `bookingService.ts` | `/booking/:id/cancel` | `/booking/v1/:id/cancel` |
| `bookingService.ts` | `/booking/:id/status` | `/booking/v1/:id/status` |
| `bookingService.ts` | `/booking/:id/disputes` | `/booking/v1/:id/disputes` |
| `bookingAttachmentService.ts` | `/booking/:id/attachments` | `/booking/v1/:id/attachments` |
| `bookingAttachmentService.ts` | `/uploads/booking/:id/attachment` | `/uploads/booking/:id/attachment` (unchanged — new endpoint) |
| `chatService.ts` | `/chat/conversations` | `/chat/v1/conversations` |
| `chatService.ts` | `/chat/conversations/:id/messages` | `/chat/v1/conversations/:id/messages` |
| `chatService.ts` | `/chat/conversations/:id/read` | `/chat/v1/conversations/:id/read` |
| `notificationService.ts` | `/notifications` | `/notifications/v1` |
| `notificationService.ts` | `/notifications/unread-count` | `/notifications/v1/unread-count` |
| `notificationService.ts` | `/notifications/:id/read` | `/notifications/v1/:id/read` |
| `notificationService.ts` | `/notifications/read-all` | `/notifications/v1/read-all` |
| `paymentService.ts` | `/payments/...` | `/payments/v1/...` |
| `providerBookingService.ts` | `/provider/...` | `/provider/v1/...` |
| `providerBookingActionsService.ts` | `/provider/...` | `/provider/v1/...` |
| `providerCatalogService.ts` | `/provider/my-services/...` | `/provider/v1/my-services/...` |
| `providerProfileService.ts` | `/provider/...` | `/provider/v1/...` |
| `providerAvailabilityService.ts` | `/provider/...` | `/provider/v1/...` |
| `marketplaceService.ts` | `/services/...` | `/services/v1/...` (check v2 search) |
| `profileService.ts` | `/users/...` | `/users/v1/...` |
| `addressService.ts` | `/users/addresses/...` | `/users/v1/addresses/...` |
| `userService.ts` | `/users/...` | `/users/v1/...` |
| `customerFeedbackService.ts` | `/provider/reviews` | `/provider/v1/reviews` |
| `supportService.ts` | `/support/tickets` | `/support/v1/tickets` |
| `psgcService.ts` | `/locations/...` | `/locations/v1/...` |

> **Note:** `psgcService.ts` and `marketplaceService.ts` may call external PSGC APIs directly — verify during implementation that only backend-bound paths are updated.

---

## Section 2 — Missing Backend Endpoints (ServEase-BE additions)

Two upload endpoints are already called by the mobile but do not exist on the backend. One review endpoint needs enhancement.

### 2a. `POST /api/uploads/booking/:bookingId/attachment`

New gateway route + handler. Accepts `multipart/form-data` with a `file` field. Uploads the file to Supabase Storage bucket `booking-attachments` on the backend. Returns:
```json
{ "id": "...", "public_url": "...", "label": "...", "storage_path": "..." }
```
Requires auth (`SupabaseAuthGuard`).

### 2b. `POST /api/uploads/avatar`

New gateway route + handler. Accepts `multipart/form-data` with a `file` field. Uploads to Supabase Storage bucket `avatars` using the authenticated user's ID as filename (`{userId}.jpg`). Returns:
```json
{ "avatar_url": "..." }
```
Requires auth.

Both upload endpoints live in a new `UploadsController` in the gateway (`src/controllers/uploads.controller.ts`). No Kafka/microservice involved — the gateway handles storage directly (same pattern as the existing KYC reupload endpoint in `provider.controller.ts`).

### 2c. Enhance `GET /api/provider/v1/reviews/:id`

Currently returns `{ reviewer_id, rating, review_text, created_at }` per review. Extend to also include `reviewer_name: string` by joining with the `users` table on `reviewer_id`. The ratings screen (`app/(provider-tabs)/ratings.tsx`) needs this to display who left each review.

---

## Section 3 — Remaining Direct Supabase Data Calls → API

### 3a. `app/(provider-tabs)/index.tsx` — average rating

**Before:** `supabase.from('reviews').select('rating').eq('provider_id', user.id)`  
**After:** The existing `GET /api/provider/v1/reviews/:id` already returns `average_rating`. Use that value directly instead of computing it from raw rows. No new endpoint needed.

### 3b. `app/(provider-tabs)/ratings.tsx` — review list with reviewer name

**Before:** `supabase.from('reviews')` with join to `user_profiles` for `full_name`  
**After:** `GET /api/provider/v1/reviews/:id` (enhanced per Section 2c to include `reviewer_name`)

### 3c. `src/features/bookings/screens/CustomerBookingDetailsScreen.tsx` — multi-table booking fetch

**Before:** 4 separate direct queries across `booking_svc`, `identity_svc`, `provider_catalog_svc` schemas  
**After:** Single call to `GET /api/booking/v1/:id` — the backend already returns an enriched booking object including provider user, provider profile, and service name.

The screen also calls `supabase.storage.from('avatars').getPublicUrl(avatarPath)`. This is not a network call — it just constructs a URL. Replace with direct string construction:
```typescript
`${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${userId}.jpg`
```
No SDK needed for this.

### 3d. `services/bookingAttachmentService.ts` — attachment record insert

**Before:** `bookingDb.from('booking_attachments').insert([...])` — direct DB write  
**After:** `POST /api/booking/v1/:id/attachments` — this endpoint already exists on the backend

---

## Section 4 — Realtime Channels → Polling

Replace all `supabase.channel()` subscriptions with `setInterval` polling. This matches the existing pattern in `chatService.ts` (5s) and `notificationService.ts` (10s).

| Screen | Current | Replacement |
|---|---|---|
| `app/(provider-tabs)/index.tsx` | `channel('provider-dashboard-bookings-...')` on `booking_svc.bookings` | Poll `loadDashboard()` every 15s |
| `app/(provider-tabs)/metrics.tsx` | `channel('provider-metrics-...')` | Poll metrics reload every 30s |
| `app/(tabs)/index.tsx` | `channel('home-bookings-...')` | Poll `loadBookings()` every 15s |
| `app/(tabs)/bookings.tsx` | `channel('customer-bookings-...')` on `booking_svc.bookings` | Poll `loadBookings()` every 15s |
| `CustomerBookingsScreen.tsx` | `channel(...)` on bookings table | Poll `loadBookings()` every 15s |
| `ProviderBookingsScreen.tsx` | `channel(...)` on bookings table | Poll `loadBookings()` every 15s |

Pattern to use (matches chatService):
```typescript
useEffect(() => {
  if (!user?.id) return;
  const interval = setInterval(() => void loadData(), 15_000);
  return () => clearInterval(interval);
}, [loadData, user?.id]);
```

---

## Section 5 — Remove Supabase from Mobile

Once all above changes are complete and verified:

1. **Delete** `lib/supabase.ts`
2. **Delete** `lib/db.ts`
3. **Remove** `@supabase/supabase-js` from `ServEase-MB/package.json`
4. **Remove** `react-native-url-polyfill` from `package.json` (was only needed for Supabase)
5. **Remove** `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env` / `.env.example`
6. **Keep** `EXPO_PUBLIC_SUPABASE_URL` temporarily if needed for avatar URL construction — or replace with a hardcoded storage base URL constant and remove it too
7. **Update** `ServEase-MB/CLAUDE.md` — remove the "Microservice Database Migration" section and the "Schema Client Pattern" section; replace with a note that the mobile communicates exclusively through the NestJS backend

---

## Architecture After Migration

```
ServEase-MB (React Native / Expo)
    │
    │  HTTP (Bearer token)
    │  EXPO_PUBLIC_API_URL → http://localhost:5000
    ▼
ServEase-BE (NestJS Gateway, port 5000)
    │  Kafka
    ├──▶ auth-service
    ├──▶ booking-service
    ├──▶ chat-service
    ├──▶ notification-service
    ├──▶ provider-service
    ├──▶ payment-service
    ├──▶ customer-service
    ├──▶ catalog-service
    └──▶ support-service
              │
              ▼
         Supabase (PostgreSQL + Storage)
              ↑
         ServEase-FE (Next.js Admin, also talks to gateway)
```

No arrow from `ServEase-MB` to Supabase.

---

## Out of Scope

- WebSocket / Server-Sent Events from backend (polling is sufficient)
- Changes to `ServEase-FE` (web admin panel) — not affected
- Supabase schema migration (already in progress separately per CLAUDE.md)
- Any new features — this is a pure migration
