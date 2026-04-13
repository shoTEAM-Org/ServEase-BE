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
