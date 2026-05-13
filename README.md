# ServEase Backend

Backend services for ServEase admin and provider/customer operations.

## Requirements (local setup)

- **Node.js**: 20 LTS recommended
- **npm**: 10+ (bundled with modern Node.js)
- **Docker Desktop**: required for local Kafka via `docker compose`
- **Supabase project**: `SUPABASE_URL` and `SUPABASE_SECRET_KEY`
- **Git**

## Environment setup

1. Create your backend env file from the template:

```bash
# from /backend
copy .env.example .env
```

2. Fill in `.env` values:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `JWT_SECRET`
   - `PORT` (default `5000`)
   - `KAFKA_BROKER` (default `localhost:9092`)

## Start dependencies (Docker / Kafka)

```bash
# from /backend
docker compose up -d kafka
```

Or through npm:

```bash
npm run infra:up
npm run infra:wait
```

To stop Kafka:

```bash
docker compose down
```

## Install dependencies

```bash
# from /backend
npm install
```

## Run backend services

For the full backend stack used by the mobile app, run Kafka first, then all
Nest services:

```bash
npm run infra:up
npm run infra:wait
npm run start:dev:all
```

Start only the gateway (HTTP API):

```bash
npm run start:gateway:dev
```

If you are testing booking/payment flows, make sure at least these services are
running:

- gateway
- booking-service
- payment-service
- auth-service
- provider-service

Build before running production commands:

```bash
docker compose up -d kafka
npm install
npm run start:dev:all
npm run build
```

## Local verification

Health check:

```powershell
Invoke-RestMethod "http://localhost:5000/health/live"
```

Pricing engine check:

```powershell
Invoke-RestMethod `
  -Method POST `
  -Uri "http://localhost:5000/api/pricing/v1/quote" `
  -ContentType "application/json" `
  -Body '{"pricing_mode":"hourly","hourly_rate":500,"hours_required":2}'
```

Expected pricing values:

- `total_amount`: `1000`
- `platform_fee`: `100`
- `provider_earnings`: `900`

Register a test customer:

```powershell
Invoke-RestMethod `
  -Method POST `
  -Uri "http://localhost:5000/api/auth/v1/register/customer" `
  -ContentType "application/json" `
  -Body '{"full_name":"Test Customer","email":"testcustomer001@example.com","password":"Password123!","contact_number":"09170000001","role":"customer","address":"Sample address"}'
```

Login and store the access token:

```powershell
$login = Invoke-RestMethod `
  -Method POST `
  -Uri "http://localhost:5000/api/auth/v1/login" `
  -ContentType "application/json" `
  -Body '{"email":"testcustomer001@example.com","password":"Password123!"}'

$token = $login.access_token
```

Get available services/providers:

```powershell
Invoke-RestMethod "http://localhost:5000/api/services/v1"
Invoke-RestMethod "http://localhost:5000/api/provider/v1"
```

Create a booking after replacing `PROVIDER_UUID` and `SERVICE_UUID` with real
IDs from your data:

```powershell
Invoke-RestMethod `
  -Method POST `
  -Uri "http://localhost:5000/api/booking/v1/create" `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body '{"provider_id":"PROVIDER_UUID","service_id":"SERVICE_UUID","service_address":"Sample address","service_location_type":"mobile","scheduled_at":"2026-05-01T10:00:00","pricing_mode":"hourly","hourly_rate":500,"hours_required":2,"payment_method":"cash_on_service"}'
```

Successful booking/payment integration should return `booking`, `pricing`, and
`payment`, with matching amounts.

## Windows Docker notes

If PowerShell cannot find Docker:

```powershell
$env:Path += ";C:\Program Files\Docker\Docker\resources\bin"
docker info
```

If Docker CLI exists but the server section fails, open Docker Desktop and wait
until it says the engine is running. If needed:

```powershell
wsl --shutdown
```
mowsesyu 01111
Then reopen Docker Desktop and run:

```powershell
docker context use desktop-linux
docker ps
npm run infra:up
npm run infra:wait
```

If Kafka is not reachable at `localhost:9092`, restart Kafka:

```powershell
npm run infra:down
npm run infra:up
npm run infra:wait
```

In a second terminal, run the gateway/Kafka smoke:

```bash
npm run test:golden
```

## Admin integration endpoints (recently wired)

The following admin workflows are now supported through gateway -> Kafka -> admin-service:

- User Management
  - Customers: list, detail, status update
  - Service Providers: list, detail, status update
  - Approval Queue: list applications, application detail, approve/reject status update
- Operations
  - All Bookings: list bookings for admin operations view
  - Ongoing Services: update booking status and create dispute/escalation records

## Important runtime note

After pulling backend route/pattern updates, restart gateway and admin-service so new handlers/subscriptions are active. Ensure Kafka is running before testing admin pages.

## Tests

```bash
npm run test
npm run test:golden
```

## Microservice Isolation Guards

Validate schema ownership boundaries:

```bash
npm run check:schema-boundaries
```

Validate strict service-scoped Supabase env (only enforced when `SUPABASE_STRICT_SERVICE_SCOPE=true`):

```bash
npm run check:strict-service-env
```

When strict mode is enabled, `npm run start:all` and `npm run start:dev:all` automatically run the strict-env validator before booting services.
