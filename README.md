# ServEase Backend

Backend services for ServEase admin and provider/customer operations.

## Requirements (local setup)

- **Node.js**: 20+ recommended
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

Start gateway (HTTP API):

```bash
npm run start:gateway:dev
```

If you need all services:

```bash
npm run build
npm run start:dev:all
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
npm run test:e2e
```
