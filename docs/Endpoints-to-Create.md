# Endpoints to Create (Draft)

Status: Draft for review only. Do not implement yet.
Prepared: 2026-04-13

## Scope

This draft lists API endpoints that are currently missing in backend but required by the admin pages.

Excluded from this draft:
- Endpoints that already exist in `api/admin/v1` (customers, operations, finance core, categories, services, service areas, broadcasts, reports).
- Frontend-only styling issues (for example, page visuals like "Details - no background, just text").

---

## 1) Account

### 1.1 Account Settings

- Method: GET
- Path: /api/admin/v1/account/settings
- Purpose: Load admin preferences (language, timezone, theme, notification toggles, retention).
- Query params: none
- Response (draft):

```json
{
  "settings": {
    "language": "en",
    "timezone": "Asia/Manila",
    "theme": "light",
    "email_notifications": true,
    "push_notifications": false,
    "booking_alerts": true,
    "payment_alerts": true,
    "dispute_alerts": true,
    "data_retention_days": 90,
    "updated_at": "2026-04-13T10:00:00.000Z"
  }
}
```

- Method: PATCH
- Path: /api/admin/v1/account/settings
- Purpose: Update admin preferences.
- Request body (draft):

```json
{
  "language": "en",
  "timezone": "Asia/Manila",
  "theme": "light",
  "email_notifications": true,
  "push_notifications": false,
  "booking_alerts": true,
  "payment_alerts": true,
  "dispute_alerts": true,
  "data_retention_days": 90
}
```

- Response (draft):

```json
{ "status": "accepted" }
```

- Suggested storage:
  - `admin_settings` table keyed by `admin_user_id`, or
  - shared `platform_config` with per-user namespace.

### 1.2 Account Activity Log

- Method: GET
- Path: /api/admin/v1/account/activity-log
- Purpose: Show recent actions performed by the current admin.
- Query params (draft):
  - `page` (default 1)
  - `limit` (default 20)
  - `from` (optional ISO date)
  - `to` (optional ISO date)
- Response (draft):

```json
{
  "logs": [
    {
      "id": "LOG-001",
      "user_id": "admin-user-id",
      "action": "UPDATE_COMMISSION",
      "resource": "commission_rules",
      "resource_id": "rule-id",
      "metadata": { "old_value": 0.18, "new_value": 0.2 },
      "created_at": "2026-04-13T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

## 2) Marketplace and Marketing

### 2.1 Promotions

- Method: GET
- Path: /api/admin/v1/marketplace/promotions
- Purpose: List promotions with filters and pagination.
- Query params (draft):
  - `page`, `limit`
  - `status` (active, scheduled, expired, disabled)
  - `type` (percent, fixed)
  - `search`
- Response (draft):

```json
{
  "promotions": [
    {
      "id": "PROMO-001",
      "code": "WELCOME50",
      "title": "Welcome Promo",
      "description": "50% off first booking",
      "discount_type": "percent",
      "discount_value": 50,
      "min_basket": 500,
      "usage_limit": 1000,
      "usage_count": 342,
      "status": "active",
      "start_date": "2026-01-01",
      "end_date": "2026-03-31",
      "category_restriction": null,
      "created_at": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

- Method: POST
- Path: /api/admin/v1/marketplace/promotions
- Purpose: Create promotion.

- Method: PATCH
- Path: /api/admin/v1/marketplace/promotions/:id
- Purpose: Update promotion.

- Method: DELETE
- Path: /api/admin/v1/marketplace/promotions/:id
- Purpose: Remove promotion.

- Suggested storage:
  - `promotions` table with status lifecycle fields and audit fields.

---

## 3) Platform Settings

### 3.1 Commission

- Method: GET
- Path: /api/admin/v1/settings/commission
- Purpose: Read platform commission config.

- Method: PATCH
- Path: /api/admin/v1/settings/commission
- Purpose: Update commission config.
- Request body (draft):

```json
{
  "default_commission_rate": 0.18,
  "category_overrides": [
    { "category_id": "CAT-001", "commission_rate": 0.2 }
  ]
}
```

### 3.2 Admin Roles and Permissions

- Method: GET
- Path: /api/admin/v1/settings/roles
- Purpose: List roles and permissions.

- Method: POST
- Path: /api/admin/v1/settings/roles
- Purpose: Create role.

- Method: PATCH
- Path: /api/admin/v1/settings/roles/:id
- Purpose: Update role.

- Method: DELETE
- Path: /api/admin/v1/settings/roles/:id
- Purpose: Delete role.

- Method: POST
- Path: /api/admin/v1/settings/roles/assign
- Purpose: Assign role to admin user.
- Request body (draft):

```json
{
  "user_id": "admin-user-id",
  "role_id": "role-id"
}
```

### 3.3 Security Settings

- Method: GET
- Path: /api/admin/v1/settings/security
- Purpose: Load platform security policy.

- Method: PATCH
- Path: /api/admin/v1/settings/security
- Purpose: Update platform security policy.
- Request body (draft):

```json
{
  "require_2fa": true,
  "session_timeout_minutes": 30,
  "ip_whitelist_enabled": false,
  "ip_whitelist": []
}
```

### 3.4 Notification Settings

- Method: GET
- Path: /api/admin/v1/settings/notifications
- Purpose: List system notification rules/templates.

- Method: PATCH
- Path: /api/admin/v1/settings/notifications/:id
- Purpose: Update notification rule/template.

### 3.5 Logs and Audit Trail

- Method: GET
- Path: /api/admin/v1/settings/logs
- Purpose: System-wide audit trail for admins.
- Query params (draft):
  - `page`, `limit`, `from`, `to`, `user_id`, `action`

### 3.6 Integrations

- Method: GET
- Path: /api/admin/v1/settings/integrations
- Purpose: List integration configs and health state.

- Method: PATCH
- Path: /api/admin/v1/settings/integrations/:id
- Purpose: Update integration config.

---

## 4) Proposed Tables (Draft)

1. `admin_settings`
- `id`, `admin_user_id`, `language`, `timezone`, `theme`, `email_notifications`, `push_notifications`, `booking_alerts`, `payment_alerts`, `dispute_alerts`, `data_retention_days`, `updated_at`

2. `audit_log`
- `id`, `user_id`, `action`, `resource`, `resource_id`, `metadata` (jsonb), `created_at`

3. `promotions`
- `id`, `code`, `title`, `description`, `discount_type`, `discount_value`, `min_basket`, `usage_limit`, `usage_count`, `status`, `start_date`, `end_date`, `category_restriction`, `created_at`, `updated_at`

4. `admin_roles`
- `id`, `name`, `permissions` (jsonb), `created_at`, `updated_at`

5. `admin_role_assignments`
- `id`, `user_id`, `role_id`, `created_at`

6. `notification_config`
- `id`, `event_type`, `channels` (jsonb), `template`, `is_enabled`, `updated_at`

7. `integrations_config`
- `id`, `name`, `provider`, `credentials` (encrypted jsonb), `is_active`, `health_status`, `updated_at`

8. `platform_config` (optional consolidated config)
- `key`, `value` (jsonb), `updated_at`

---

## 5) Notes and Open Decisions

1. Schema naming alignment is required before implementation.
- Current admin service uses schemas like `identity_and_user`, `provider_catalog`, `booking`, `payment`, `trust_and_reputation`, `notification_and_support`.
- Architecture docs also reference `_svc` schemas (`identity_svc`, `provider_catalog_svc`, etc.).
- Ensure the schemas use the actual names in supabase.

2. Endpoint style decision needed.
- For updates, decide whether to keep async `202 accepted` (Kafka emit) or return synchronous updated data for settings pages.

3. Auth scope decision needed.
- Confirm role checks for all `/api/admin/v1/settings/*` endpoints.

4. Data ownership decision needed.
- Decide whether Account Settings are per-admin user, global platform settings, or mixed.

---

## 6) Recommended Review Order (No Implementation Yet)

1. Confirm endpoint paths and naming.
2. Confirm request/response contract per page.
3. Confirm table strategy and schema names.
4. Confirm sync vs async behavior for each write endpoint.
5. Confirm RBAC requirements.
