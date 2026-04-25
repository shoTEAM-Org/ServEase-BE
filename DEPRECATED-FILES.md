# Deprecated Files — Safe to Delete

The project is a NestJS monorepo with Kafka as the message transport.

- **Entry point**: `src/main.ts` boots `src/gateway.module.ts` — an HTTP server on port 5000
- **Gateway controllers** in `src/controllers/` receive REST requests and forward them via `ClientKafka`
- **Microservices** in `apps/*/src/` are standalone Kafka consumers, each with their own `main.ts`
- **Kafka infrastructure** lives in `libs/common/src/kafka/`

The previously listed files have been removed as part of the DB-alignment scrub.

---

## Removed

- `libs/common/src/mock-data/ph-locations.ts`
- `libs/common/src/mock-data/providers-by-service.ts`
- `test/app.e2e-spec.ts`
- `test/jest-e2e.json`

`src/app.module.ts` and `src/modules/` were already absent in this checkout.

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
