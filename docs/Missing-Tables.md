# Missing Tables — Backend Supabase Project

These tables do not yet exist in the backend Supabase project (`onbojolpltzjyyruwevk`).
Until they are created, the corresponding API endpoints return hardcoded/empty data or fail at runtime.

See [API-Endpoints.md](../API-Endpoints.md) for the full list of affected endpoints (marked `stub` or `needs-table`).

---

## Summary

| Table | Schema | Needed By | Endpoint Status |
|-------|--------|-----------|----------------|
| `admin_settings` | `identity_and_user` | Account settings | stub |
| `audit_log` | `identity_and_user` | Activity log, Settings > Logs | stub |
| `promotions` | `provider_catalog` | Marketplace promotions | stub |
| `platform_config` | `identity_and_user` | Commission, Security settings | stub |
| `admin_roles` | `identity_and_user` | Roles & permissions | stub |
| `admin_role_assignments` | `identity_and_user` | Role assignment | stub |
| `notification_config` | `notification_and_support` | Notification settings | stub |
| `integrations_config` | `identity_and_user` | Integrations | stub |
| `booking_reschedule_requests` | `booking` | Provider reschedule requests | needs-table |
| `additional_charges` | `booking` | Provider additional charges | needs-table |

---

## Table Definitions

### 1. `admin_settings`

**Schema:** `identity_and_user`
**Purpose:** Stores per-admin UI and notification preferences.
**Endpoints unblocked:**
- `GET /api/admin/v1/account/settings`
- `PATCH /api/admin/v1/account/settings`

```sql
CREATE TABLE identity_and_user.admin_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id    UUID NOT NULL REFERENCES identity_and_user.users(id) ON DELETE CASCADE,
  language         TEXT NOT NULL DEFAULT 'en',
  timezone         TEXT NOT NULL DEFAULT 'Asia/Manila',
  theme            TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  email_notifications   BOOLEAN NOT NULL DEFAULT TRUE,
  push_notifications    BOOLEAN NOT NULL DEFAULT FALSE,
  booking_alerts        BOOLEAN NOT NULL DEFAULT TRUE,
  payment_alerts        BOOLEAN NOT NULL DEFAULT TRUE,
  dispute_alerts        BOOLEAN NOT NULL DEFAULT TRUE,
  data_retention_days   INTEGER NOT NULL DEFAULT 90,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id)
);
```

---

### 2. `audit_log`

**Schema:** `identity_and_user`
**Purpose:** Records all admin actions for both the per-admin activity log and the system-wide audit trail.
**Endpoints unblocked:**
- `GET /api/admin/v1/account/activity-log`
- `GET /api/admin/v1/settings/logs`

```sql
CREATE TABLE identity_and_user.audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES identity_and_user.users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,              -- e.g. 'UPDATE_COMMISSION', 'DELETE_REVIEW'
  resource     TEXT,                       -- e.g. 'commission_rules', 'reviews'
  resource_id  TEXT,                       -- ID of the affected resource
  metadata     JSONB,                      -- before/after values or additional context
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_user_id_idx  ON identity_and_user.audit_log (user_id);
CREATE INDEX audit_log_created_idx  ON identity_and_user.audit_log (created_at DESC);
CREATE INDEX audit_log_action_idx   ON identity_and_user.audit_log (action);
```

---

### 3. `promotions`

**Schema:** `provider_catalog`
**Purpose:** Discount / promo campaigns created by admins.
**Endpoints unblocked:**
- `GET /api/admin/v1/marketplace/promotions`
- `POST /api/admin/v1/marketplace/promotions`
- `PATCH /api/admin/v1/marketplace/promotions/:id`
- `DELETE /api/admin/v1/marketplace/promotions/:id`

```sql
CREATE TABLE provider_catalog.promotions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  description          TEXT,
  discount_type        TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value       NUMERIC(10, 2) NOT NULL,
  min_basket           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  usage_limit          INTEGER,               -- NULL = unlimited
  usage_count          INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('active', 'scheduled', 'expired', 'disabled')),
  start_date           DATE,
  end_date             DATE,
  category_restriction UUID,                  -- FK to service_categories if restricted
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX promotions_status_idx ON provider_catalog.promotions (status);
```

---

### 4. `platform_config`

**Schema:** `identity_and_user`
**Purpose:** Key-value store for platform-wide settings (commission rates, security policies, etc.).
**Endpoints unblocked:**
- `GET /api/admin/v1/settings/commission`
- `PATCH /api/admin/v1/settings/commission`
- `GET /api/admin/v1/settings/security`
- `PATCH /api/admin/v1/settings/security`

```sql
CREATE TABLE identity_and_user.platform_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed commission config
INSERT INTO identity_and_user.platform_config (key, value) VALUES
  ('commission', '{"default_commission_rate": 0.18, "category_overrides": []}'),
  ('security',   '{"require_2fa": false, "session_timeout_minutes": 60, "ip_whitelist_enabled": false, "ip_whitelist": []}');
```

**Note on commission `category_overrides`:** Each override is a JSON object
`{ "category_id": "<uuid>", "commission_rate": 0.20 }`. Validate in service code
rather than in a separate table to keep config atomic.

---

### 5. `admin_roles`

**Schema:** `identity_and_user`
**Purpose:** Named permission sets that can be assigned to admin users.
**Endpoints unblocked:**
- `GET /api/admin/v1/settings/roles`
- `POST /api/admin/v1/settings/roles`
- `PATCH /api/admin/v1/settings/roles/:id`
- `DELETE /api/admin/v1/settings/roles/:id`

```sql
CREATE TABLE identity_and_user.admin_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  permissions  JSONB NOT NULL DEFAULT '[]',  -- array of permission strings
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### 6. `admin_role_assignments`

**Schema:** `identity_and_user`
**Purpose:** Maps admin users to their role(s).
**Endpoints unblocked:**
- `POST /api/admin/v1/settings/roles/assign`

```sql
CREATE TABLE identity_and_user.admin_role_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity_and_user.users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES identity_and_user.admin_roles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id)
);
```

---

### 7. `notification_config`

**Schema:** `notification_and_support`
**Purpose:** Configures which system events trigger notifications and via which channels.
**Endpoints unblocked:**
- `GET /api/admin/v1/settings/notifications`
- `PATCH /api/admin/v1/settings/notifications/:id`

```sql
CREATE TABLE notification_and_support.notification_config (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   TEXT NOT NULL UNIQUE,  -- e.g. 'booking_confirmed', 'payment_received'
  channels     JSONB NOT NULL DEFAULT '["in_app"]',  -- array: "email", "push", "in_app"
  template     TEXT,                  -- message template string (optional)
  is_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### 8. `integrations_config`

**Schema:** `identity_and_user`
**Purpose:** Third-party integration settings (payment gateways, SMS providers, etc.).
**Endpoints unblocked:**
- `GET /api/admin/v1/settings/integrations`
- `PATCH /api/admin/v1/settings/integrations/:id`

```sql
CREATE TABLE identity_and_user.integrations_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,           -- display name, e.g. 'Maya Payments'
  provider       TEXT NOT NULL,           -- slug, e.g. 'maya', 'gcash', 'semaphore'
  credentials    JSONB,                   -- store encrypted; never expose raw in API responses
  is_active      BOOLEAN NOT NULL DEFAULT FALSE,
  health_status  TEXT NOT NULL DEFAULT 'unknown'
                   CHECK (health_status IN ('ok', 'degraded', 'down', 'unknown')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Security note:** `credentials` must be encrypted at rest (use Supabase Vault or
`pgcrypto.encrypt`) and must never be included in GET response payloads.
The service layer should strip credentials before returning integration rows.

---

### 9. `booking_reschedule_requests`

**Schema:** `booking`
**Purpose:** Tracks provider-initiated reschedule requests for a booking.
**Endpoints unblocked:**
- `POST /api/provider/v1/reschedule-requests`
- `GET /api/provider/v1/reschedule-requests/:bookingId`
- `PATCH /api/provider/v1/reschedule-requests/:requestId/review`

> This table exists in the mobile app's `public` schema (pending migration to `booking_svc`)
> but has **not** been created in the backend Supabase project's `booking` schema.

```sql
CREATE TABLE booking.booking_reschedule_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES booking.bookings(id) ON DELETE CASCADE,
  provider_id    UUID NOT NULL,
  reason         TEXT NOT NULL,
  explanation    TEXT,
  proposed_date  DATE NOT NULL,
  proposed_time  TIME NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX brrq_booking_idx  ON booking.booking_reschedule_requests (booking_id);
CREATE INDEX brrq_provider_idx ON booking.booking_reschedule_requests (provider_id);
```

---

### 10. `additional_charges`

**Schema:** `booking`
**Purpose:** Line items for extra work billed by a provider during a booking, subject to customer approval.
**Endpoints unblocked:**
- `POST /api/provider/v1/additional-charges`
- `GET /api/provider/v1/additional-charges/:bookingId`
- `PATCH /api/provider/v1/additional-charges/review`

> Same situation as `booking_reschedule_requests`: exists in the mobile app's `public` schema
> but not in the backend Supabase project's `booking` schema.

```sql
CREATE TABLE booking.additional_charges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES booking.bookings(id) ON DELETE CASCADE,
  requested_by   UUID NOT NULL,           -- provider user_id
  description    TEXT NOT NULL,
  amount         NUMERIC(10, 2) NOT NULL,
  justification  TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ac_booking_idx ON booking.additional_charges (booking_id);
```

---

## Open Decisions

1. **Schema for admin tables** — The definitions above place admin tables in `identity_and_user`
   since that schema already holds `users`. If a dedicated `admin` schema is preferred,
   all six admin tables can be moved there without changing the service code (only the
   `.schema('...')` call changes).

2. **`audit_log` population** — The table definition alone is not enough; service methods that
   perform write operations must be updated to insert a row into `audit_log` after each mutation
   (e.g. after approving KYC, updating commission, etc.).

3. **`integrations_config` credentials encryption** — Decide on encryption strategy
   (Supabase Vault vs. `pgcrypto`) before inserting real credentials.

4. **`booking_reschedule_requests` / `additional_charges` in backend project** —
   These may also need RLS policies matching whatever policy pattern is applied to
   the `booking.bookings` table in the backend project.
