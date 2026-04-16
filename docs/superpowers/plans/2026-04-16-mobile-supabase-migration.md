# Mobile Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every direct Supabase call from `ServEase-MB` so all data access flows through the `ServEase-BE` NestJS gateway.

**Architecture:** Fix the mobile HTTP client URL mismatch first, then add two missing upload endpoints to the backend, migrate remaining direct Supabase calls to use existing API endpoints, replace realtime channels with polling, and finally strip the Supabase SDK from the mobile app.

**Tech Stack:** React Native (Expo), NestJS, Supabase (backend only after migration), Kafka, Multer, `@supabase/supabase-js` (backend only)

---

## File Map

**ServEase-BE — new/modified**
- Create: `src/controllers/uploads.controller.ts`
- Modify: `src/gateway.module.ts`
- Modify: `apps/provider-service/src/provider.service.ts` (enhance `getProviderReviews`)

**ServEase-MB — modified**
- `lib/apiClient.ts` — BASE_URL fix
- `services/authService.ts` — path updates
- `services/bookingService.ts` — path updates
- `services/bookingAttachmentService.ts` — path updates + remove `bookingDb.insert`
- `services/chatService.ts` — path updates
- `services/notificationService.ts` — path updates
- `services/paymentService.ts` — path updates
- `services/providerBookingService.ts` — path updates
- `services/providerBookingActionsService.ts` — path updates
- `services/providerCatalogService.ts` — path updates
- `services/providerProfileService.ts` — path updates
- `services/providerAvailabilityService.ts` — path updates
- `services/providerVerificationService.ts` — path updates
- `services/marketplaceService.ts` — path updates
- `services/profileService.ts` — path updates
- `services/userService.ts` — path updates
- `services/addressService.ts` — path updates (prefix change: `/addresses` → `/users/v1/addresses`)
- `services/supportService.ts` — path updates (prefix change: `/users/support-tickets` → `/support/v1/tickets`)
- `services/customerFeedbackService.ts` — path updates
- `services/psgcService.ts` — path updates
- `lib/avatar.ts` — remove `supabase.storage`, construct URL manually
- `app/(provider-tabs)/index.tsx` — remove `supabase.from('reviews')` + remove channel + add polling
- `app/(provider-tabs)/ratings.tsx` — remove `supabase.from('reviews')`, use API
- `app/(provider-tabs)/metrics.tsx` — remove channel, add polling
- `app/(tabs)/index.tsx` — remove channel, add polling
- `app/(tabs)/bookings.tsx` — remove channel, add polling
- `src/features/bookings/screens/CustomerBookingDetailsScreen.tsx` — remove 4 DB queries + storage URL
- `src/features/bookings/screens/CustomerBookingsScreen.tsx` — remove channel, add polling
- `src/features/bookings/screens/ProviderBookingsScreen.tsx` — remove channel, add polling
- `src/features/auth/screens/ProviderSignupScreen.tsx` — remove unused supabase imports

**ServEase-MB — deleted**
- `lib/supabase.ts`
- `lib/db.ts`

---

## Task 1: Fix apiClient BASE_URL and default port

**Files:**
- Modify: `ServEase-MB/lib/apiClient.ts`
- Modify: `ServEase-MB/lib/__tests__/apiClient.test.ts`

- [ ] **Step 1: Read the existing test to understand current assertions**

```bash
# In ServEase-MB directory
cat lib/__tests__/apiClient.test.ts
```

- [ ] **Step 2: Write a failing test that verifies BASE_URL uses /api (not /api/v1) and port 5000**

Add to `lib/__tests__/apiClient.test.ts` (or update existing BASE_URL test if one exists):

```typescript
// Verify that the default base URL points to port 5000 with /api suffix
// (The apiClient module doesn't export BASE_URL, so we test it via fetch mock behavior)
it('sends requests to /api/{path} not /api/v1/{path}', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: {} }),
  });
  global.fetch = fetchMock as any;

  // Mock auth token
  jest.mock('../auth-session', () => ({
    getStoredAccessToken: async () => null,
    getStoredRefreshToken: async () => null,
    persistAuthSession: async () => {},
  }));

  await api.get('/auth/v1/me');

  const calledUrl: string = fetchMock.mock.calls[0][0];
  expect(calledUrl).toContain('/api/auth/v1/me');
  expect(calledUrl).not.toContain('/api/v1/auth');
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd ServEase-MB
npm test -- --testPathPattern="apiClient" --no-coverage
```

Expected: FAIL — URL contains `/api/v1/auth` (old format)

- [ ] **Step 4: Update `lib/apiClient.ts` — fix BASE_URL**

Replace lines 1-8 of `lib/apiClient.ts`:

```typescript
import {
  getStoredAccessToken,
  getStoredRefreshToken,
  persistAuthSession,
} from './auth-session';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000').replace(/\/$/, '') + '/api';
```

Also update the `tryRefreshSession` path inside the same file (currently `/auth/refresh`):

```typescript
async function tryRefreshSession() {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${BASE_URL}/auth/v1/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    await persistAuthSession(null);
    return false;
  }

  const json = await res.json().catch(() => ({}));
  if (!json?.data) {
    await persistAuthSession(null);
    return false;
  }

  await persistAuthSession(json.data);
  return true;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ServEase-MB
npm test -- --testPathPattern="apiClient" --no-coverage
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd ServEase-MB
git add lib/apiClient.ts lib/__tests__/apiClient.test.ts
git commit -m "fix: update apiClient BASE_URL to match backend route structure"
```

---

## Task 2: Update auth, booking, and booking-attachment service paths

**Files:**
- Modify: `ServEase-MB/services/authService.ts`
- Modify: `ServEase-MB/services/bookingService.ts`
- Modify: `ServEase-MB/services/bookingAttachmentService.ts`

- [ ] **Step 1: Run existing tests to establish baseline**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -20
```

Note which tests pass/fail before changes.

- [ ] **Step 2: Update `services/authService.ts` — insert /v1/ in all paths**

```typescript
import { api } from '@/lib/apiClient';
import {
  AppAuthSession,
  PasswordResetContext,
  persistAuthSession,
  persistPasswordResetContext,
} from '@/lib/auth-session';

type CustomerSignupInput = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  referralCode: string;
};

type LoginResponse = AppAuthSession;
type MeResponse = { user: AppAuthSession['user'] };
type SessionEnvelope = {
  session: AppAuthSession;
};

async function applySession(session: AppAuthSession) {
  await persistAuthSession(session);
  return session;
}

export async function registerCustomer(input: CustomerSignupInput) {
  const response = await api.post<SessionEnvelope>('/auth/v1/register/customer', {
    full_name: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    contact_number: input.phone.trim(),
    role: 'customer',
  });

  return applySession(response.session);
}

export async function loginUser(identifier: string, password: string) {
  const session = await api.post<LoginResponse>('/auth/v1/login', {
    identifier: identifier.trim().toLowerCase(),
    password: password.trim(),
  });

  return applySession(session);
}

export async function refreshSession(refreshToken: string) {
  const session = await api.post<AppAuthSession>('/auth/v1/refresh', {
    refresh_token: refreshToken,
  });

  return applySession(session);
}

export async function fetchCurrentUser() {
  return api.get<MeResponse>('/auth/v1/me');
}

export async function logoutUser() {
  try {
    await api.post<{ ok: boolean }>('/auth/v1/logout');
  } catch {
    // Local session cleanup is the source of truth for the mobile app.
  } finally {
    await persistAuthSession(null);
  }
}

export async function requestPasswordReset(email: string, redirectUrl: string) {
  await api.post<{ message: string }>('/auth/v1/forgot-password', {
    email: email.trim().toLowerCase(),
    redirect_to: redirectUrl,
  });
}

export async function resetPassword(password: string, context: PasswordResetContext | null) {
  await api.post<{ message: string }>('/auth/v1/reset-password', {
    password: password.trim(),
    access_token: context?.accessToken,
    refresh_token: context?.refreshToken,
    code: context?.code,
    token_hash: context?.tokenHash,
    type: context?.type,
  });

  await persistPasswordResetContext(null);
  await persistAuthSession(null);
}
```

- [ ] **Step 3: Update `services/bookingService.ts` — insert /v1/ in all paths**

```typescript
import { api } from '../lib/apiClient';
import { Booking, EnrichedBooking } from '../src/types/database.interfaces';
import type { PaymentMethod } from './paymentService';

const normalizeBookingPaymentMethod = (paymentMethod?: PaymentMethod | null) => {
  const normalized = String(paymentMethod || '').trim().toLowerCase();
  if (normalized === 'cash') {
    return 'cash_on_service';
  }

  return normalized || 'cash_on_service';
};

export const getCustomerBookings = async (_customerId?: string): Promise<EnrichedBooking[]> => {
  const { bookings } = await api.get<{ bookings: EnrichedBooking[] }>('/booking/v1/customer');
  return bookings;
};

export const createBooking = async (bookingData: any) => {
  const scheduledAt = parseScheduleLocal(
    String(bookingData.scheduled_date_key || bookingData.scheduled_date || '').trim(),
    String(bookingData.scheduled_time || '').trim()
  );

  if (!scheduledAt) {
    throw new Error('Please choose a valid booking date and time before confirming.');
  }

  const inserted = await api.post<{ booking: Booking }>('/booking/v1/create', {
    provider_id: bookingData.provider_id,
    service_id: bookingData.service_id,
    service_address: bookingData.service_address || bookingData.address || '',
    service_location_type: bookingData.service_location_type || 'mobile',
    scheduled_at: scheduledAt.toISOString(),
    pricing_mode: bookingData.pricing_mode || 'flat',
    hourly_rate: bookingData.hourly_rate,
    flat_rate: bookingData.flat_rate,
    hours_required: bookingData.hours_required,
    payment_method: normalizeBookingPaymentMethod(bookingData.payment_method),
  });

  return inserted.booking;
};

export const getBookingById = async (bookingId: string): Promise<EnrichedBooking> => {
  const { booking } = await api.get<{ booking: EnrichedBooking }>(`/booking/v1/${bookingId}`);
  return booking;
};

export const cancelCustomerBooking = async (
  bookingId: string,
  _customerId: string,
  reason: string,
  explanation: string
) => {
  const { booking } = await api.patch<{ booking: Booking }>(`/booking/v1/${bookingId}/cancel`, {
    reason,
    explanation,
  });
  return booking;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const parseTimeTo24h = (input: string) => {
  const pattern = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
  const m = pattern.exec(String(input || '').trim());
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const period = m[3].toUpperCase();
  if (period === 'AM') { if (hours === 12) hours = 0; } else if (hours !== 12) hours += 12;
  return { hours, minutes };
};

const parseScheduleLocal = (dateInput: string, timeInput: string) => {
  const time = parseTimeTo24h(timeInput);
  if (!time) return null;
  const pattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const ymd = pattern.exec(dateInput);
  if (ymd) {
    const dt = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), time.hours, time.minutes, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const parsedDate = new Date(dateInput);
  if (Number.isNaN(parsedDate.getTime())) return null;
  const dt = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), time.hours, time.minutes, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
};
```

- [ ] **Step 4: Update `services/bookingAttachmentService.ts` — path updates only (DB removal comes in Task 8)**

Change only the path strings:
- Line with `uploadBookingAttachment`: `/uploads/booking/${input.bookingId}/attachment` stays as-is (new endpoint, no `/v1/`)
- Line with `getBookingAttachments`: `/booking/${bookingId}/attachments` → `/booking/v1/${bookingId}/attachments`

```typescript
// In getBookingAttachments function:
const { attachments } = await api.get<{ attachments: BookingAttachmentRow[] }>(`/booking/v1/${bookingId}/attachments`);
```

- [ ] **Step 5: Run tests**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -20
```

Expected: same pass/fail as baseline (no regressions).

- [ ] **Step 6: Commit**

```bash
cd ServEase-MB
git add services/authService.ts services/bookingService.ts services/bookingAttachmentService.ts
git commit -m "fix: update auth and booking service paths to match backend v1 routes"
```

---

## Task 3: Update chat, notification, and payment service paths

**Files:**
- Modify: `ServEase-MB/services/chatService.ts`
- Modify: `ServEase-MB/services/notificationService.ts`
- Modify: `ServEase-MB/services/paymentService.ts`

- [ ] **Step 1: Update all `/chat/` paths in `services/chatService.ts`**

Find and replace these 4 path strings (do not change any logic):

| Before | After |
|--------|-------|
| `'/chat/conversations?role=customer'` | `'/chat/v1/conversations?role=customer'` |
| `'/chat/conversations?role=provider'` | `'/chat/v1/conversations?role=provider'` |
| `'/chat/conversations/' + bookingId + '/messages'` | `'/chat/v1/conversations/' + bookingId + '/messages'` |
| `'/chat/conversations/' + bookingId + '/read'` | `'/chat/v1/conversations/' + bookingId + '/read'` |

- [ ] **Step 2: Update all `/notifications/` paths in `services/notificationService.ts`**

| Before | After |
|--------|-------|
| `'/notifications'` | `'/notifications/v1'` |
| `'/notifications/unread-count'` | `'/notifications/v1/unread-count'` |
| `'/notifications/' + notificationId + '/read'` | `'/notifications/v1/' + notificationId + '/read'` |
| `'/notifications/read-all'` | `'/notifications/v1/read-all'` |

- [ ] **Step 3: Update all `/payments/` paths in `services/paymentService.ts`**

| Before | After |
|--------|-------|
| `` `/payments/booking/${bookingId}` `` | `` `/payments/v1/booking/${bookingId}` `` |
| `'/payments/provider/history'` | `'/payments/v1/provider/history'` |
| `'/payments/provider/earnings-summary'` | `'/payments/v1/provider/earnings-summary'` |
| `'/payments/booking/ensure'` | `'/payments/v1/booking/ensure'` |
| `'/payments/booking/mark-paid'` | `'/payments/v1/booking/mark-paid'` |
| `` `/payments/booking/${bookingId}/cancel` `` | `` `/payments/v1/booking/${bookingId}/cancel` `` |
| `` `/payments/booking/${bookingId}/amount` `` | `` `/payments/v1/booking/${bookingId}/amount` `` |

- [ ] **Step 4: Run tests**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -20
```

Expected: no regressions.

- [ ] **Step 5: Commit**

```bash
cd ServEase-MB
git add services/chatService.ts services/notificationService.ts services/paymentService.ts
git commit -m "fix: update chat, notification, payment service paths to v1 routes"
```

---

## Task 4: Update provider service paths

**Files:**
- Modify: `ServEase-MB/services/providerBookingService.ts`
- Modify: `ServEase-MB/services/providerBookingActionsService.ts`
- Modify: `ServEase-MB/services/providerCatalogService.ts`
- Modify: `ServEase-MB/services/providerProfileService.ts`
- Modify: `ServEase-MB/services/providerAvailabilityService.ts`
- Modify: `ServEase-MB/services/providerVerificationService.ts`

- [ ] **Step 1: Update `services/providerBookingService.ts`**

| Before | After |
|--------|-------|
| `'/provider/bookings'` | `'/provider/v1/bookings'` |
| `` `/provider/booking/${bookingId}` `` | `` `/provider/v1/booking/${bookingId}` `` |
| `` `/provider/booking/${bookingId}/status` `` | `` `/provider/v1/booking/${bookingId}/status` `` |
| `'/support/tickets'` | `'/support/v1/tickets'` |
| `` `/booking/${bookingId}/disputes` `` | `` `/booking/v1/${bookingId}/disputes` `` |

- [ ] **Step 2: Update `services/providerBookingActionsService.ts`**

| Before | After |
|--------|-------|
| `'/provider/reschedule-requests'` | `'/provider/v1/reschedule-requests'` |
| `` `/provider/reschedule-requests/${bookingId}` `` | `` `/provider/v1/reschedule-requests/${bookingId}` `` |
| `'/provider/additional-charges'` | `'/provider/v1/additional-charges'` |
| `` `/provider/additional-charges/${bookingId}` `` | `` `/provider/v1/additional-charges/${bookingId}` `` |
| `` `/provider/reschedule-requests/${input.requestId}/review` `` | `` `/provider/v1/reschedule-requests/${input.requestId}/review` `` |
| `'/provider/additional-charges/review'` | `'/provider/v1/additional-charges/review'` |

- [ ] **Step 3: Update `services/providerCatalogService.ts`**

| Before | After |
|--------|-------|
| `'/services/categories'` | `'/services/v1/categories'` |
| `` `/services/provider/${providerId}/services` `` | `` `/services/v1/provider/${providerId}/services` `` |
| `'/provider/my-services'` | `'/provider/v1/my-services'` |
| `` `/provider/my-services/${serviceId}` `` | `` `/provider/v1/my-services/${serviceId}` `` |

- [ ] **Step 4: Update `services/providerProfileService.ts`**

| Before | After |
|--------|-------|
| `` `/provider/${userId}/profile-draft` `` (GET) | `` `/provider/v1/${userId}/profile-draft` `` |
| `` `/provider/${userId}/profile-draft` `` (PATCH) | `` `/provider/v1/${userId}/profile-draft` `` |

- [ ] **Step 5: Update `services/providerAvailabilityService.ts`**

| Before | After |
|--------|-------|
| `` `/provider/${userId}/availability` `` (GET) | `` `/provider/v1/${userId}/availability` `` |
| `'/provider/availability'` (PUT) | `'/provider/v1/availability'` |
| `` `/provider/${providerId}/reserved-slots` `` | `` `/provider/v1/${providerId}/reserved-slots` `` |
| `` `/provider/${providerId}/availability/check` `` | `` `/provider/v1/${providerId}/availability/check` `` |

- [ ] **Step 6: Update `services/providerVerificationService.ts`**

| Before | After |
|--------|-------|
| `` `/provider/${userId}/profile-draft` `` (GET) | `` `/provider/v1/${userId}/profile-draft` `` |
| `` `/provider/${userId}/profile-draft` `` (PATCH) | `` `/provider/v1/${userId}/profile-draft` `` |

- [ ] **Step 7: Run tests**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -20
```

Expected: no regressions.

- [ ] **Step 8: Commit**

```bash
cd ServEase-MB
git add services/providerBookingService.ts services/providerBookingActionsService.ts services/providerCatalogService.ts services/providerProfileService.ts services/providerAvailabilityService.ts services/providerVerificationService.ts
git commit -m "fix: update provider service paths to v1 routes"
```

---

## Task 5: Update marketplace, profile, user, address, support, feedback, and PSGC paths

**Files:**
- Modify: `ServEase-MB/services/marketplaceService.ts`
- Modify: `ServEase-MB/services/profileService.ts`
- Modify: `ServEase-MB/services/userService.ts`
- Modify: `ServEase-MB/services/addressService.ts`
- Modify: `ServEase-MB/services/supportService.ts`
- Modify: `ServEase-MB/services/customerFeedbackService.ts`
- Modify: `ServEase-MB/services/psgcService.ts`

- [ ] **Step 1: Update `services/marketplaceService.ts`**

| Before | After |
|--------|-------|
| `'/services/categories'` | `'/services/v1/categories'` |
| `` `/services/categories/${encodeURIComponent(categoryName)}/services` `` | `` `/services/v1/categories/${encodeURIComponent(categoryName)}/services` `` |
| `` `/services/providers/${encodeURIComponent(serviceName)}` `` | `` `/services/v1/providers/${encodeURIComponent(serviceName)}` `` |
| `` `/services/provider-profile/${providerId}` `` | `` `/services/v1/provider-profile/${providerId}` `` |

- [ ] **Step 2: Update `services/profileService.ts`**

| Before | After |
|--------|-------|
| `'/users/profile'` (GET) | `'/users/v1/profile'` |
| `'/users/profile'` (PATCH) | `'/users/v1/profile'` |
| `'/customer/profile'` (GET) | `'/customer/v1/profile'` |
| `'/customer/profile'` (PATCH) | `'/customer/v1/profile'` |

- [ ] **Step 3: Update `services/userService.ts`**

| Before | After |
|--------|-------|
| `'/users/profile'` (GET) | `'/users/v1/profile'` |
| `'/users/profile'` (PATCH) | `'/users/v1/profile'` |

- [ ] **Step 4: Update `services/addressService.ts`** (note: prefix changes, not just version insertion)

The backend serves addresses at `/api/users/v1/addresses`, not `/api/addresses`.

```typescript
import { api } from '../lib/apiClient';

export type AddressRecord = {
  id?: string;
  user_id?: string;
  label?: string;
  street?: string;
  street_address?: string;
  barangay?: string;
  city?: string;
  province?: string;
  region?: string;
  postal_code?: string;
  zip_code?: string;
  latitude?: number | null;
  longitude?: number | null;
  is_default?: boolean;
};

export const getUserAddresses = async (): Promise<AddressRecord[]> => {
  const { addresses } = await api.get<{ addresses: AddressRecord[] }>('/users/v1/addresses');
  return addresses;
};

export const addAddress = async (address: AddressRecord): Promise<AddressRecord> => {
  const { address: created } = await api.post<{ address: AddressRecord }>('/users/v1/addresses', address);
  return created;
};

export const updateAddress = async (id: string, updates: Partial<AddressRecord>): Promise<AddressRecord> => {
  const { address } = await api.patch<{ address: AddressRecord }>(`/users/v1/addresses/${id}`, updates);
  return address;
};

export const deleteAddress = async (id: string): Promise<void> => {
  await api.delete(`/users/v1/addresses/${id}`);
};
```

- [ ] **Step 5: Update `services/supportService.ts`** (note: prefix changes from `/users/support-tickets` to `/support/v1/tickets`)

```typescript
import { api } from '../lib/apiClient';
import { SupportTicket } from '../src/types/database.interfaces';

export const createSupportTicket = async (input: {
  userId: string;
  subject: string;
  message: string;
  category?: string;
  role?: 'customer' | 'provider';
}) => {
  const { ticket } = await api.post<{ ticket: SupportTicket }>('/support/v1/tickets', {
    subject: input.subject,
    message: input.message,
    category: input.category,
    role: input.role,
  });
  return ticket;
};

export const createCustomerSupportTicket = async (
  userId: string,
  subject: string,
  message: string,
  category?: string
) =>
  createSupportTicket({
    userId,
    subject,
    message,
    category,
    role: 'customer',
  });

export const createProviderSupportTicket = async (
  userId: string,
  subject: string,
  message: string,
  category?: string
) =>
  createSupportTicket({
    userId,
    subject,
    message,
    category,
    role: 'provider',
  });
```

- [ ] **Step 6: Update `services/customerFeedbackService.ts`**

| Before | After |
|--------|-------|
| `'/provider/reviews'` | `'/provider/v1/reviews'` |
| `'/provider/reports'` | `'/provider/v1/reports'` |

- [ ] **Step 7: Update `services/psgcService.ts`**

| Before | After |
|--------|-------|
| `'/locations/provinces'` | `'/locations/v1/provinces'` |
| `` `/locations/provinces/${provinceCode}/cities` `` | `` `/locations/v1/provinces/${provinceCode}/cities` `` |
| `` `/locations/cities/${cityCode}/barangays` `` | `` `/locations/v1/cities/${cityCode}/barangays` `` |

- [ ] **Step 8: Run tests**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -20
```

Expected: no regressions.

- [ ] **Step 9: Commit**

```bash
cd ServEase-MB
git add services/marketplaceService.ts services/profileService.ts services/userService.ts services/addressService.ts services/supportService.ts services/customerFeedbackService.ts services/psgcService.ts
git commit -m "fix: update remaining service paths to match backend v1 route structure"
```

---

## Task 6: Backend — Add UploadsController

**Files:**
- Create: `ServEase-BE/src/controllers/uploads.controller.ts`
- Modify: `ServEase-BE/src/gateway.module.ts`

- [ ] **Step 1: Write a test for the upload controller**

Create `ServEase-BE/src/controllers/uploads.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UploadsController } from './uploads.controller';
import { SupabaseClient } from '@supabase/supabase-js';
import { BadRequestException } from '@nestjs/common';

const mockStorageUpload = jest.fn();
const mockStorageGetPublicUrl = jest.fn();

const mockSupabase = {
  storage: {
    from: jest.fn(() => ({
      upload: mockStorageUpload,
      getPublicUrl: mockStorageGetPublicUrl,
    })),
  },
};

describe('UploadsController', () => {
  let controller: UploadsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: SupabaseClient, useValue: mockSupabase }],
    }).compile();

    controller = module.get<UploadsController>(UploadsController);
    jest.clearAllMocks();
  });

  describe('uploadAvatar', () => {
    it('throws BadRequestException when no file provided', async () => {
      const req = { user: { id: 'user-123' } };
      await expect(controller.uploadAvatar(undefined as any, req as any)).rejects.toThrow(BadRequestException);
    });

    it('calls supabase storage upload with avatars bucket', async () => {
      mockStorageUpload.mockResolvedValue({ error: null });
      mockStorageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/avatars/user-123.jpg' } });

      const file = { originalname: 'photo.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('data') } as Express.Multer.File;
      const req = { user: { id: 'user-123' } };

      const result = await controller.uploadAvatar(file, req as any);

      expect(mockSupabase.storage.from).toHaveBeenCalledWith('avatars');
      expect(mockStorageUpload).toHaveBeenCalledWith('user-123.jpg', file.buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      expect(result).toEqual({ avatar_url: 'https://example.com/avatars/user-123.jpg' });
    });
  });

  describe('uploadBookingAttachment', () => {
    it('throws BadRequestException when no file provided', async () => {
      const req = { user: { id: 'user-123' } };
      await expect(controller.uploadBookingAttachment('booking-1', undefined as any, req as any)).rejects.toThrow(BadRequestException);
    });

    it('calls supabase storage upload with booking-attachments bucket', async () => {
      mockStorageUpload.mockResolvedValue({ error: null });
      mockStorageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/booking-attachments/booking-1/file.jpg' } });

      const file = { originalname: 'photo.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('data') } as Express.Multer.File;
      const req = { user: { id: 'user-123' } };

      const result = await controller.uploadBookingAttachment('booking-1', file, req as any);

      expect(mockSupabase.storage.from).toHaveBeenCalledWith('booking-attachments');
      expect(result).toMatchObject({ public_url: expect.any(String), label: 'photo.jpg' });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails (controller doesn't exist yet)**

```bash
cd ServEase-BE
npm test -- --testPathPattern="uploads.controller" --no-coverage
```

Expected: FAIL — cannot find module `./uploads.controller`

- [ ] **Step 3: Create `src/controllers/uploads.controller.ts`**

```typescript
import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Request,
  BadRequestException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';
import 'multer';

@Controller('api/uploads')
@UseGuards(SupabaseAuthGuard)
export class UploadsController {
  constructor(@Inject(SupabaseClient) private readonly supabase: SupabaseClient) {}

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException('A file is required.');

    const userId: string = req['user'].id;
    const filePath = `${userId}.jpg`;

    const { error } = await this.supabase.storage
      .from('avatars')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: true });

    if (error) throw new InternalServerErrorException(error.message);

    const { data } = this.supabase.storage.from('avatars').getPublicUrl(filePath);
    return { avatar_url: data.publicUrl };
  }

  @Post('booking/:bookingId/attachment')
  @UseInterceptors(FileInterceptor('file'))
  async uploadBookingAttachment(
    @Param('bookingId') bookingId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('A file is required.');

    const sanitizedName = file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `attachment-${Date.now()}.jpg`;

    const storagePath = `${bookingId}/${Date.now()}_${sanitizedName}`;

    const { error } = await this.supabase.storage
      .from('booking-attachments')
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (error) throw new InternalServerErrorException(error.message);

    const { data } = this.supabase.storage.from('booking-attachments').getPublicUrl(storagePath);

    return {
      id: storagePath,
      public_url: data.publicUrl,
      label: sanitizedName,
      storage_path: storagePath,
    };
  }
}
```

- [ ] **Step 4: Register UploadsController in `src/gateway.module.ts`**

Add the import at the top:
```typescript
import { UploadsController } from './controllers/uploads.controller.js';
```

Add `UploadsController` to the `controllers` array:
```typescript
controllers: [
  AuthController,
  UsersController,
  BookingController,
  ChatController,
  PaymentController,
  ProviderController,
  CustomerController,
  AdminController,
  ServicesController,
  ReferenceController,
  LocationsController,
  NotificationsController,
  SupportController,
  UploadsController,  // <-- add this
],
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ServEase-BE
npm test -- --testPathPattern="uploads.controller" --no-coverage
```

Expected: PASS (2 describe blocks, 4 tests)

- [ ] **Step 6: Commit**

```bash
cd ServEase-BE
git add src/controllers/uploads.controller.ts src/controllers/uploads.controller.spec.ts src/gateway.module.ts
git commit -m "feat: add UploadsController for avatar and booking attachment uploads"
```

---

## Task 7: Backend — Enhance reviews response with reviewer_name

**Files:**
- Modify: `ServEase-BE/apps/provider-service/src/provider.service.ts`

- [ ] **Step 1: Write a failing test for the enhanced `getProviderReviews`**

Create `ServEase-BE/apps/provider-service/src/provider.service.spec.ts` (or add to existing):

```typescript
import { ProviderService } from './provider.service';

const mockSingle = jest.fn();
const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockSchema = jest.fn();

const mockSupabase = {
  schema: mockSchema,
};

describe('ProviderService.getProviderReviews', () => {
  let service: ProviderService;

  beforeEach(() => {
    service = new ProviderService(mockSupabase as any);
    jest.clearAllMocks();

    // Chain: schema().from().select().eq().single()
    mockSingle.mockResolvedValue({ data: { average_rating: 4.5, total_reviews: 2 }, error: null });
    mockOrder.mockResolvedValue({
      data: [
        { id: 'r1', reviewer_id: 'u1', rating: 5, review_text: 'Great!', created_at: '2026-01-01' },
      ],
      error: null,
    });
    mockEq.mockReturnValue({ single: mockSingle, order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSchema.mockReturnValue({ from: mockFrom });
  });

  it('returns reviews with reviewer_name from users table', async () => {
    // Override: first schema call (provider_catalog profile) returns profile
    // Second call (reviews) returns reviews with reviewer_id
    // Third call (identity_and_user users) returns user names
    const profileSchemaFrom = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: { average_rating: 4.5, total_reviews: 1 } }) }) }) });
    const reviewsSchemaFrom = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: [{ id: 'r1', reviewer_id: 'user-abc', rating: 5, review_text: 'Great!', created_at: '2026-01-01' }] }) }) }) });
    const usersSchemaIn = jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ in: jest.fn().mockResolvedValue({ data: [{ id: 'user-abc', full_name: 'Alice' }] }) }) });

    mockSchema
      .mockReturnValueOnce({ from: profileSchemaFrom })
      .mockReturnValueOnce({ from: reviewsSchemaFrom })
      .mockReturnValueOnce({ from: usersSchemaIn });

    const result = await service.getProviderReviews('provider-1');

    expect(result.data.reviews[0]).toMatchObject({
      id: 'r1',
      reviewer_name: 'Alice',
      rating: 5,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ServEase-BE
npm test -- --testPathPattern="provider.service.spec" --no-coverage
```

Expected: FAIL — `reviewer_name` is undefined

- [ ] **Step 3: Update `getProviderReviews` in `apps/provider-service/src/provider.service.ts`**

Replace the existing `getProviderReviews` method (around line 142):

```typescript
async getProviderReviews(providerId: string) {
  const { data: profile } = await this.supabase
    .schema('provider_catalog')
    .from('provider_profiles')
    .select('average_rating, total_reviews')
    .eq('user_id', providerId)
    .single();

  const { data: reviews } = await this.supabase
    .schema('trust_and_reputation')
    .from('reviews')
    .select('id, reviewer_id, rating, review_text, created_at')
    .eq('reviewee_id', providerId)
    .order('created_at', { ascending: false });

  const reviewRows = reviews || [];

  // Fetch reviewer names in a single query
  const reviewerIds = [...new Set(reviewRows.map((r: any) => r.reviewer_id).filter(Boolean))];
  let nameMap: Record<string, string> = {};
  if (reviewerIds.length > 0) {
    const { data: users } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('id, full_name')
      .in('id', reviewerIds);
    nameMap = Object.fromEntries((users || []).map((u: any) => [u.id, u.full_name || 'Anonymous']));
  }

  return {
    status: 'success',
    data: {
      provider_id: providerId,
      average_rating: Number(profile?.average_rating) || 0,
      total_reviews: Number(profile?.total_reviews) || 0,
      reviews: reviewRows.map((r: any) => ({
        ...r,
        reviewer_name: nameMap[r.reviewer_id] || 'Anonymous',
      })),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ServEase-BE
npm test -- --testPathPattern="provider.service.spec" --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ServEase-BE
git add apps/provider-service/src/provider.service.ts apps/provider-service/src/provider.service.spec.ts
git commit -m "feat: include reviewer_name in provider reviews response"
```

---

## Task 8: Migrate bookingAttachmentService — remove direct DB write

**Files:**
- Modify: `ServEase-MB/services/bookingAttachmentService.ts`

- [ ] **Step 1: Write a failing test**

Create `ServEase-MB/services/__tests__/bookingAttachmentService.test.ts`:

```typescript
import { saveBookingAttachments } from '../bookingAttachmentService';
import { api } from '../../lib/apiClient';

jest.mock('../../lib/apiClient');
jest.mock('../../lib/db'); // ensure db is not called

const mockApiPost = api.post as jest.Mock;

describe('saveBookingAttachments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls POST /booking/v1/:id/attachments and returns rows', async () => {
    const fakeRows = [{ id: 'a1', booking_id: 'b1', file_url: 'http://x.com/file.jpg', file_name: 'file.jpg', mime_type: 'image/jpeg' }];
    mockApiPost.mockResolvedValue({ attachments: fakeRows });

    const result = await saveBookingAttachments('b1', [
      { uri: 'http://x.com/file.jpg', label: 'file.jpg', storagePath: 'b1/file.jpg' },
    ]);

    expect(mockApiPost).toHaveBeenCalledWith('/booking/v1/b1/attachments', expect.any(Object));
    expect(result).toEqual(fakeRows);
  });

  it('returns empty array when no attachments provided', async () => {
    const result = await saveBookingAttachments('b1', []);
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ServEase-MB
npm test -- --testPathPattern="bookingAttachmentService" --no-coverage
```

Expected: FAIL — `api.post` not called (current code uses `bookingDb.from(...).insert(...)`)

- [ ] **Step 3: Replace direct DB write in `saveBookingAttachments` with API call**

In `services/bookingAttachmentService.ts`, replace the `saveBookingAttachments` function:

```typescript
export const saveBookingAttachments = async (
  bookingId: string,
  attachments: BookingAttachmentDraft[]
) => {
  const normalized = attachments
    .map(normalizeAttachmentDraft)
    .filter((attachment) => attachment.uri);

  if (!normalized.length) return [] as BookingAttachmentRow[];

  const payload = {
    attachments: normalized.map((attachment, index) => ({
      file_url: attachment.uri,
      file_name: attachment.label || `Attachment ${index + 1}`,
      mime_type: guessMimeType(attachment.uri),
      storage_path: attachment.storagePath,
    })),
  };

  try {
    const { attachments: rows } = await api.post<{ attachments: BookingAttachmentRow[] }>(
      `/booking/v1/${bookingId}/attachments`,
      payload,
    );
    return rows || ([] as BookingAttachmentRow[]);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Failed to save booking attachments.'));
  }
};
```

Also remove the `bookingDb` import at the top of the file (line 1: `import { bookingDb } from '../lib/db';`).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ServEase-MB
npm test -- --testPathPattern="bookingAttachmentService" --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ServEase-MB
git add services/bookingAttachmentService.ts services/__tests__/bookingAttachmentService.test.ts
git commit -m "fix: replace direct Supabase insert with API call in bookingAttachmentService"
```

---

## Task 9: Migrate CustomerBookingDetailsScreen — remove 4 direct DB queries

**Files:**
- Modify: `ServEase-MB/src/features/bookings/screens/CustomerBookingDetailsScreen.tsx`

- [ ] **Step 1: Read the full `loadLiveBooking` function in the screen**

```bash
# Check what data the existing enriched booking response provides
# Compare with what the screen currently constructs manually
grep -n "bookingDb\|identityDb\|providerCatalogDb\|supabase\." src/features/bookings/screens/CustomerBookingDetailsScreen.tsx
```

- [ ] **Step 2: Update the import block — remove `supabase`, `identityDb`, `providerCatalogDb`, `bookingDb`**

Change line 7 from:
```typescript
import { supabase, identityDb, providerCatalogDb, bookingDb } from '@/lib/db';
```
To:
```typescript
import { api } from '@/lib/apiClient';
```

If `api` is already imported elsewhere in the file, remove the duplicate.

- [ ] **Step 3: Replace `loadLiveBooking` to use the API**

Find `async function loadLiveBooking()` in the screen. Replace the body (the 4 Supabase queries and the data assembly below them) with:

```typescript
async function loadLiveBooking() {
  const bookingId = String(params.id || initialBooking?.id || '').trim();
  if (!bookingId || bookingId.startsWith('BK-')) return;

  setIsLoading(true);
  try {
    const { booking: bookingRow } = await api.get<{ booking: any }>(`/booking/v1/${bookingId}`);
    if (!bookingRow) return;

    const scheduled = bookingRow.scheduled_at ? new Date(bookingRow.scheduled_at) : null;
    const now = new Date();
    const diffMs = scheduled ? Math.max(0, scheduled.getTime() - now.getTime()) : 0;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    const statusRaw = String(bookingRow.status || 'Pending');
    const businessName = String(bookingRow.provider?.business_name || '').trim();
    const providerName = String(bookingRow.provider?.full_name || 'Service Provider');
    const serviceTitle = String(bookingRow.service_title || initialBooking?.service || 'Service Booking');
    const providerAvatarUrl = bookingRow.provider?.avatar_url
      ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${bookingRow.provider_id}.jpg`
      : '';

    const normalized = {
      id: bookingRow.id,
      booking_reference: bookingRow.booking_reference,
      status: statusRaw as any,
      service: serviceTitle,
      address: bookingRow.service_address || 'N/A',
      date: scheduled
        ? scheduled.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
        : initialBooking?.date || 'N/A',
      year: scheduled ? String(scheduled.getFullYear()) : initialBooking?.year || '',
      time: scheduled
        ? scheduled.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : initialBooking?.time || 'N/A',
      total_amount: bookingRow.total_amount,
      totalAmount: Number(bookingRow.total_amount || 0).toFixed(2),
      customer_notes: bookingRow.customer_notes || '',
      notes: String(bookingRow.customer_notes || '').trim(),
      countdown: { days, hours, mins },
      provider: {
        id: bookingRow.provider_id,
        full_name: providerName,
        business_name: businessName,
        contact_number: bookingRow.provider?.contact_number || '',
        average_rating: bookingRow.provider?.average_rating || 0,
        verification_status: bookingRow.provider?.verification_status || '',
        is_verified: bookingRow.provider?.is_verified || false,
        avatar_url: providerAvatarUrl,
      },
    };

    // Update screen state — adapt to whatever state setters the screen uses
    // (preserve all existing setState calls with the new normalized object)
    setBooking(normalized as any);
  } catch (err) {
    setError(getErrorMessage(err, 'Failed to load booking details.'));
  } finally {
    setIsLoading(false);
  }
}
```

> **Note:** The screen may use different state variable names (`setBooking`, `setDetails`, etc.). Match the setState calls to whatever the existing screen uses — do not rename state variables.

- [ ] **Step 4: Run tests**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -20
```

Expected: no regressions. TypeScript compile check:
```bash
cd ServEase-MB
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
cd ServEase-MB
git add src/features/bookings/screens/CustomerBookingDetailsScreen.tsx
git commit -m "fix: replace 4 direct Supabase queries in CustomerBookingDetailsScreen with API call"
```

---

## Task 10: Migrate provider dashboard — remove supabase.from('reviews') and channel

**Files:**
- Modify: `ServEase-MB/app/(provider-tabs)/index.tsx`

- [ ] **Step 1: Remove `supabase` import**

Find:
```typescript
import { supabase } from "@/lib/supabase";
```
Delete this line.

- [ ] **Step 2: Replace the `supabase.from('reviews')` call in `loadDashboard`**

The current code fetches reviews to compute `averageRating`. The backend's `GET /api/provider/v1/reviews/:id` already returns `average_rating`. Update the `Promise.all` in `loadDashboard`:

```typescript
const [data, earningsSummary, reviewsResponse] = await Promise.all([
  getProviderBookings(user.id),
  getProviderEarningsSummary(user.id),
  api.get<{ data: { average_rating: number; total_reviews: number } }>(`/provider/v1/reviews/${user.id}`),
]);

setRows(data);
setPaidEarnings(earningsSummary.totalNetEarnings);
setPendingCollections(earningsSummary.pendingRevenue);
setAverageRating(reviewsResponse?.data?.average_rating?.toFixed(1) ?? '0.0');
```

Add `import { api } from '@/lib/apiClient';` at the top if not already present.

- [ ] **Step 3: Replace the realtime channel with polling**

Find and remove this entire `useEffect`:
```typescript
useEffect(() => {
  if (!user?.id) return;
  const channel = supabase
    .channel(`provider-dashboard-bookings-${user.id}`)
    .on(...)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}, [loadDashboard, user?.id]);
```

Replace with:
```typescript
useEffect(() => {
  if (!user?.id) return;
  const interval = setInterval(() => void loadDashboard(), 15_000);
  return () => clearInterval(interval);
}, [loadDashboard, user?.id]);
```

- [ ] **Step 4: Run tests**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -20
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
cd ServEase-MB
git add "app/(provider-tabs)/index.tsx"
git commit -m "fix: remove direct Supabase calls from provider dashboard, use API + polling"
```

---

## Task 11: Migrate ratings screen — remove supabase.from('reviews')

**Files:**
- Modify: `ServEase-MB/app/(provider-tabs)/ratings.tsx`

- [ ] **Step 1: Remove `supabase` import**

Find:
```typescript
import { supabase } from '@/lib/supabase';
```
Delete this line.

- [ ] **Step 2: Replace the `fetchReviews` function body**

The current code does:
```typescript
const { data, error } = await supabase
  .from('reviews')
  .select(`id, rating, content, created_at, provider_id, customer:user_profiles (full_name, avatar_url)`)
  .eq('provider_id', user.id)
  .order('created_at', { ascending: false });
```

Replace with:
```typescript
import { api } from '@/lib/apiClient';

// Inside fetchReviews:
const response = await api.get<{
  data: {
    reviews: Array<{
      id: string;
      rating: number;
      review_text: string;
      created_at: string;
      reviewer_name: string;
    }>;
    average_rating: number;
    total_reviews: number;
  };
}>(`/provider/v1/reviews/${user.id}`);

const reviews = (response?.data?.reviews || []).map((r) => ({
  id: r.id,
  rating: r.rating,
  content: r.review_text,
  created_at: r.created_at,
  provider_id: user.id,
  customer: { full_name: r.reviewer_name || 'Anonymous', avatar_url: null },
}));

setReviewsData(reviews);
```

Adjust the shape to match exactly what `setReviewsData` and the render logic below expect (the mapping from `review_text` → `content`, `reviewer_name` → `customer.full_name` should align with the existing display code).

- [ ] **Step 3: Run tests and type check**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -20
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd ServEase-MB
git add "app/(provider-tabs)/ratings.tsx"
git commit -m "fix: replace direct Supabase query in ratings screen with API call"
```

---

## Task 12: Fix avatar URL — remove supabase.storage

**Files:**
- Modify: `ServEase-MB/lib/avatar.ts`

- [ ] **Step 1: Replace `supabase.storage.getPublicUrl` with manual URL construction**

Current:
```typescript
import { supabase } from './supabase';

export function getAvatarUrl(userId: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${userId}.jpg`);
  return data.publicUrl;
}
```

Replace with (no SDK, just string construction):
```typescript
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');

export function getAvatarUrl(userId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${userId}.jpg`;
}
```

Remove the `import { supabase } from './supabase';` line. Keep the `import { api } from './apiClient';` and all other existing code.

Full updated `lib/avatar.ts`:
```typescript
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { api } from './apiClient';

const BUCKET = 'avatars';
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');

/**
 * Returns the public URL for a user's avatar (deterministic path).
 * Append a cache-buster when displaying to avoid stale images.
 */
export function getAvatarUrl(userId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${userId}.jpg`;
}

/**
 * Opens the image picker, uploads the selected image via the API,
 * and returns the public URL. Returns null if the user cancelled.
 */
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission Required', 'Please allow access to your photo library to upload a profile picture.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];

  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    name: 'avatar.jpg',
    type: 'image/jpeg',
  } as any);

  try {
    const { avatar_url } = await api.postForm<{ avatar_url: string }>('/uploads/avatar', formData);
    return avatar_url ?? null;
  } catch (err) {
    Alert.alert('Upload Failed', (err as Error).message || 'Could not upload avatar.');
    return null;
  }
}
```

- [ ] **Step 2: Run tests**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
cd ServEase-MB
git add lib/avatar.ts
git commit -m "fix: replace supabase.storage.getPublicUrl with manual URL construction in avatar"
```

---

## Task 13: Replace all realtime channels with polling

**Files:**
- Modify: `ServEase-MB/app/(provider-tabs)/metrics.tsx`
- Modify: `ServEase-MB/app/(tabs)/index.tsx`
- Modify: `ServEase-MB/app/(tabs)/bookings.tsx`
- Modify: `ServEase-MB/src/features/bookings/screens/CustomerBookingsScreen.tsx`
- Modify: `ServEase-MB/src/features/bookings/screens/ProviderBookingsScreen.tsx`

The pattern to apply in all 5 files:

**Remove:**
```typescript
import { supabase } from '@/lib/supabase'; // or relative path

useEffect(() => {
  if (!user?.id) return;
  const channel = supabase
    .channel(`...`)
    .on('postgres_changes', { ... }, () => void loadXxx())
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}, [loadXxx, user?.id]);
```

**Replace with:**
```typescript
useEffect(() => {
  if (!user?.id) return;
  const interval = setInterval(() => void loadXxx(), 15_000);
  return () => clearInterval(interval);
}, [loadXxx, user?.id]);
```

(Where `loadXxx` is the existing data-loading callback in each screen — `loadDashboard`, `loadBookings`, etc.)

- [ ] **Step 1: Update `app/(provider-tabs)/metrics.tsx`**

Remove `import { supabase } from '@/lib/supabase';`. Find the channel useEffect (subscribed to `provider-metrics-${user.id}`), remove it, add polling useEffect with 30s interval (metrics don't need to refresh as frequently):

```typescript
useEffect(() => {
  if (!user?.id) return;
  const interval = setInterval(() => void loadMetrics(), 30_000);
  return () => clearInterval(interval);
}, [loadMetrics, user?.id]);
```

- [ ] **Step 2: Update `app/(tabs)/index.tsx`**

Remove `import { supabase } from '@/lib/supabase';`. Find the channel useEffect (`home-bookings-${user.id}`), remove it, replace with 15s polling:

```typescript
useEffect(() => {
  if (!user?.id) return;
  const interval = setInterval(() => void loadBookings(), 15_000);
  return () => clearInterval(interval);
}, [loadBookings, user?.id]);
```

- [ ] **Step 3: Update `app/(tabs)/bookings.tsx`**

Remove `import { supabase } from '@/lib/supabase';`. Find the channel useEffect (`customer-bookings-${user.id}`), remove it, replace with 15s polling of the existing load function.

- [ ] **Step 4: Update `src/features/bookings/screens/CustomerBookingsScreen.tsx`**

Remove `import { supabase } from '@/lib/supabase';`. Find and remove the channel useEffect, replace with 15s polling.

- [ ] **Step 5: Update `src/features/bookings/screens/ProviderBookingsScreen.tsx`**

Remove `import { supabase } from '@/lib/supabase';`. Find and remove the channel useEffect, replace with 15s polling.

- [ ] **Step 6: Also remove unused supabase import from `ProviderSignupScreen.tsx`**

In `src/features/auth/screens/ProviderSignupScreen.tsx`, line 17:
```typescript
import { supabase, providerCatalogDb } from '@/lib/db';
```
This import is unused (confirmed by grep). Delete the entire line.

- [ ] **Step 7: Run tests and type check**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -20
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 8: Commit**

```bash
cd ServEase-MB
git add "app/(provider-tabs)/metrics.tsx" "app/(tabs)/index.tsx" "app/(tabs)/bookings.tsx" "src/features/bookings/screens/CustomerBookingsScreen.tsx" "src/features/bookings/screens/ProviderBookingsScreen.tsx" "src/features/auth/screens/ProviderSignupScreen.tsx"
git commit -m "fix: replace all Supabase realtime channels with polling intervals"
```

---

## Task 14: Remove Supabase SDK from mobile

**Files:**
- Delete: `ServEase-MB/lib/supabase.ts`
- Delete: `ServEase-MB/lib/db.ts`
- Modify: `ServEase-MB/package.json`
- Modify: `ServEase-MB/.env.example` (if it exists)
- Modify: `ServEase-MB/CLAUDE.md`

- [ ] **Step 1: Verify no remaining imports of `lib/supabase` or `lib/db`**

```bash
cd ServEase-MB
grep -r "from.*lib/supabase\|from.*lib/db\|from '@/lib/supabase'\|from '@/lib/db'" \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules .
```

Expected: no output. If any files appear, fix them before proceeding.

- [ ] **Step 2: Verify no remaining `supabase.` or `bookingDb.` etc. usages**

```bash
cd ServEase-MB
grep -r "supabase\.\|identityDb\.\|providerCatalogDb\.\|bookingDb\.\|paymentDb\.\|trustDb\.\|notificationDb\." \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules .
```

Expected: no output. If any appear, fix those files before proceeding.

- [ ] **Step 3: Delete `lib/supabase.ts` and `lib/db.ts`**

```bash
cd ServEase-MB
rm lib/supabase.ts lib/db.ts
```

- [ ] **Step 4: Remove `@supabase/supabase-js` and `react-native-url-polyfill` from `package.json`**

Open `ServEase-MB/package.json`. Remove these two entries from `dependencies`:
- `"@supabase/supabase-js": "..."`
- `"react-native-url-polyfill": "..."` (was only needed for Supabase)

Then run:
```bash
cd ServEase-MB
npm install
```

- [ ] **Step 5: Remove `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env.example`**

Find `ServEase-MB/.env.example`. Remove the line containing `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Keep `EXPO_PUBLIC_SUPABASE_URL` — it is still used in `avatar.ts` for URL construction and in `CustomerBookingDetailsScreen.tsx`.

- [ ] **Step 6: Update `ServEase-MB/CLAUDE.md`**

Replace the entire "Microservice Database Migration — IN PROGRESS" section and the "App Code — Schema Client Pattern" section with:

```markdown
## Architecture

The mobile app communicates exclusively through the NestJS backend (`ServEase-BE`).
No direct Supabase access from mobile — all data flows through HTTP API calls using `lib/apiClient.ts`.

Base URL: `EXPO_PUBLIC_API_URL` (default: `http://localhost:5000`) → `/api/{service}/v1/{action}`

Avatar images are served from Supabase Storage via public URLs constructed as:
`${EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/{userId}.jpg`
```

- [ ] **Step 7: Final verification — run full test suite and type check**

```bash
cd ServEase-MB
npm test -- --no-coverage 2>&1 | tail -30
npx tsc --noEmit 2>&1 | head -30
```

Expected: all tests pass, no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
cd ServEase-MB
git add -A
git commit -m "feat: remove Supabase SDK from mobile — all data now flows through NestJS backend"
```
