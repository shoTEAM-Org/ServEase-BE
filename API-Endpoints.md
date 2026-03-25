# API Endpoints

Base URL: `http://localhost:5000`

## Auth (start `auth-service`)
| Method | URL | Body |
|--------|-----|------|
| POST | `/api/auth/v1/register/customer` | `{ email, password, full_name, contact_number, address }` |
| POST | `/api/auth/v1/login` | `{ identifier, password }` |
| POST | `/api/auth/v2/register` | form-data with `document_file` + provider fields |

## Booking (start `booking-service`)
| Method | URL | Notes |
|--------|-----|-------|
| POST | `/api/booking/v1/create` | Requires `Authorization: Bearer <token>` |
| GET | `/api/booking/v1/history?user_id=xxx` | |
| GET | `/api/booking/v1/requests?provider_id=xxx` | |
| PATCH | `/api/booking/v1/:id/status` | `{ status }` |

## Catalog (start `catalog-service`)
| Method | URL |
|--------|-----|
| GET | `/api/services/v1` |
| GET | `/api/services/v2/search?keyword=xxx` |
| GET | `/api/reference/v1/categories` |
| GET | `/api/locations/v1` |

## Provider (start `provider-service`)
| Method | URL |
|--------|-----|
| GET | `/api/provider/v1` |
| GET | `/api/provider/v1/:user_id` |
| GET | `/api/provider/v1/dashboard/:id` |
| GET | `/api/provider/v1/trust-score/:provider_id` |
| GET | `/api/provider/v1/reviews/:id` |
| PATCH | `/api/provider/v1/kyc/reupload` |

## Customer (start `customer-service`)
| Method | URL |
|--------|-----|
| GET | `/api/customer/v1/dashboard/:id` |

## Payment (start `payment-service`)
| Method | URL |
|--------|-----|
| POST | `/api/payments/v1/create` |
| GET | `/api/payments/v1/earnings/:provider_id` |

## Admin (start `admin-service`)
| Method | URL |
|--------|-----|
| PATCH | `/api/admin/v2/documents/status/:id` |

## Users (start `auth-service`)
| Method | URL | Notes |
|--------|-----|-------|
| GET | `/api/users/v1/profile` | Requires `Authorization: Bearer <token>` (SupabaseAuthGuard) |
