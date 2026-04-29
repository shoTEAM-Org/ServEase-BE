#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:5000}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
CUSTOMER_TOKEN="${CUSTOMER_TOKEN:-}"
PROVIDER_TOKEN="${PROVIDER_TOKEN:-}"

need_token() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "Missing $name. Export it before running this smoke script." >&2
    exit 1
  fi
}

hit() {
  local label="$1"
  local token="$2"
  local path="$3"

  echo "==> $label"
  curl --fail --silent --show-error \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/json" \
    "$API_URL$path" >/dev/null
}

need_token ADMIN_TOKEN "$ADMIN_TOKEN"
need_token CUSTOMER_TOKEN "$CUSTOMER_TOKEN"
need_token PROVIDER_TOKEN "$PROVIDER_TOKEN"

hit "auth me" "$CUSTOMER_TOKEN" "/api/auth/v1/me"
hit "user profile" "$CUSTOMER_TOKEN" "/api/users/v1/profile"
hit "services" "$CUSTOMER_TOKEN" "/api/services/v1"
hit "categories" "$CUSTOMER_TOKEN" "/api/services/v1/categories"
hit "customer bookings" "$CUSTOMER_TOKEN" "/api/booking/v1/customer"
hit "provider request queue" "$PROVIDER_TOKEN" "/api/booking/v1/requests"
hit "provider earnings" "$PROVIDER_TOKEN" "/api/payment/v1/provider/earnings-summary"
hit "notifications" "$CUSTOMER_TOKEN" "/api/notifications/v1"
hit "chat conversations" "$CUSTOMER_TOKEN" "/api/chat/v1/conversations"
hit "admin customers" "$ADMIN_TOKEN" "/api/admin/v1/users/customers"

echo "Smoke check completed."
