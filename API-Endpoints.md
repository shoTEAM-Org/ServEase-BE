# API Endpoints

Base URL: `http://localhost:5000`

## Auth (start `auth-service`)
| Method | URL | Body |
|--------|-----|------|
| POST | `/api/auth/v1/register/customer` | `{ email, password, full_name, contact_number, address }` | FUNCTIONAL
| POST | `/api/auth/v1/login` | `{ identifier, password }` | FUNCTIONAL
| POST | `/api/auth/v2/register` | form-data with `document_file` + provider fields | FUNCTIONAL

## Booking (start `booking-service`)
| Method | URL | Notes |
|--------|-----|-------|
| POST | `/api/booking/v1/create` | Requires `Authorization: Bearer <token>` | FUNCTIONAL
| GET | `/api/booking/v1/history?user_id=xxx` | | SEMI-FUNCTIONAL NOT IN TERMINAL
| GET | `/api/booking/v1/requests?provider_id=xxx` | | FUNCTIONAL
| PATCH | `/api/booking/v1/:id/status` | `{ status }` | FUNCTIONAL

## Catalog (start `catalog-service`)
| Method | URL |
|--------|-----|
| GET | `/api/services/v1` | FUNCTIONAL
| GET | `/api/services/v2/search?keyword=xxx` | FUNCTIONAL
| GET | `/api/reference/v1/categories` | FUNCTIONAL
| GET | `/api/locations/v1` | FUNCTIONAL

## Provider (start `provider-service`)
| Method | URL |
|--------|-----|
| GET | `/api/provider/v1` | FUNCTIONAL
| GET | `/api/provider/v1/:user_id` | FUNCTIONAL
| GET | `/api/provider/v1/dashboard/:id` | FUNCTIONAL
| GET | `/api/provider/v1/trust-score/:provider_id` | FUNCTIONAL
| GET | `/api/provider/v1/reviews/:id` | FUNCTIONAL
| PATCH | `/api/provider/v1/kyc/reupload` | FUNCTIONAL

## Customer (start `customer-service`)
| Method | URL |
|--------|-----|
| GET | `/api/customer/v1/dashboard/:id` | SEMI-FUNCTIONAL INTERNAL SERVER ERROR

## Payment (start `payment-service`)
| Method | URL |
|--------|-----|
| POST | `/api/payments/v1/create` | FUNCTIONAL
| GET | `/api/payments/v1/earnings/:provider_id` | FUNCTIONAL

## Admin (start `admin-service`)
| Method | URL |
|--------|-----|
| PATCH | `/api/admin/v2/documents/status/:id` | FUNCTIONAL

## Users (start `auth-service`)
| Method | URL | Notes |
|--------|-----|-------|
| GET | `/api/users/v1/profile` | Requires `Authorization: Bearer <token>` (SupabaseAuthGuard) | FUNCTIONAL
