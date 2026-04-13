# Deprecated Files — Safe to Delete

The project is a NestJS monorepo with Kafka as the message transport.

- **Entry point**: `src/main.ts` boots `src/gateway.module.ts` — an HTTP server on port 5000
- **Gateway controllers** in `src/controllers/` receive REST requests and forward them via `ClientKafka`
- **Microservices** in `apps/*/src/` are standalone Kafka consumers, each with their own `main.ts`
- **Kafka infrastructure** lives in `libs/common/src/kafka/`

Everything listed below is **not referenced by anything active** and can be deleted safely.

---

## 1. `src/app.module.ts`

An abandoned refactor attempt that imported from `src/modules/` (also deprecated below).
The active root module is `src/gateway.module.ts`.

```
src/app.module.ts
```

---

## 2. `src/modules/` — entire directory

An abandoned refactor where business logic was placed here instead of `apps/`.
None of these files are imported by any active file. The `apps/` microservices are the
active replacement for all of these.

```
src/modules/admin/
src/modules/auth/
src/modules/booking/
src/modules/catalog/
src/modules/chat/
src/modules/customer/
src/modules/locations/
src/modules/notifications/
src/modules/payment/
src/modules/provider/
src/modules/support/
src/modules/users/
```

---

## 3. `libs/common/src/mock-data/` — hardcoded mock data

Static arrays of mock providers and Philippine location data used before live
Supabase queries were wired up. Not imported anywhere active.

```
libs/common/src/mock-data/ph-locations.ts
libs/common/src/mock-data/providers-by-service.ts
```

---

## 4. `test/` — stale e2e test

References the deprecated `AppModule` from `src/app.module.ts` and tests a
`GET /` route that no longer exists in the gateway. Needs a full rewrite against
the actual gateway routes before it is useful again.

```
test/app.e2e-spec.ts
test/jest-e2e.json
```

---

## Active files (do NOT delete)

For reference, the following were previously listed as deprecated but are now active:

| File | Role |
|---|---|
| `src/kafka-setup.ts` | Provisions `servease.*` Kafka topics on startup |
| `apps/*/src/main.ts` | Standalone Kafka consumer bootstrap for each microservice |
| `apps/*/src/*.controller.ts` | Kafka `@MessagePattern` / `@EventPattern` handlers |
| `libs/common/src/kafka/patterns.ts` | Pattern constants shared between gateway and microservices |
| `libs/common/src/kafka/topics.ts` | Topic name constants |
| `libs/common/src/kafka/index.ts` | Barrel export for kafka infrastructure |
