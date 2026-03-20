# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ServEase Backend API — a NestJS service for managing service provider/customer interactions (auth, bookings, provider verification, payments). Uses Supabase (PostgreSQL) as the database and auth layer.

## Common Commands

```bash
npm run start:dev          # Development with watch mode (port 5000)
npm run build              # Compile TypeScript to dist/
npm run start:prod         # Run compiled production build
npm run lint               # ESLint with auto-fix
npm run format             # Prettier formatting
npm test                   # Jest unit tests (src/**/*.spec.ts)
npm run test:watch         # Tests in watch mode
npm run test:cov           # Tests with coverage report
npm run test:e2e           # E2E tests (test/**/*.e2e-spec.ts)
```

## Architecture

**Framework**: NestJS 11, TypeScript 5.7, Node 18+

**Database**: Supabase client is provided globally via `src/database/supabase.module.ts` (factory pattern). Some services also import a standalone client from `src/config/supabaseClient.js`. Environment requires `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (see `.env.example`).

**Module layout** — each feature under `src/modules/` follows the pattern:
- `[feature].module.ts` → NestJS module definition
- `[feature].controller.ts` → route handlers
- `[feature].service.ts` → business logic with Supabase queries
- `dto/` → class-validator DTOs for request validation

**Feature modules** (all registered in `src/app.module.ts`):
- **auth** — customer/provider registration, login (email or phone), Google OAuth. Provider registration includes KYC document upload via Multer `FileInterceptor`.
- **admin** — KYC document approval/rejection workflow (verification statuses: pending/approved/rejected)
- **provider** — profiles, trust scores, average ratings, reviews, dashboard
- **customer** — dashboard, booking history
- **booking** — creation (with provider verification check), status updates, history
- **payments** — payment processing, provider earnings
- **services** — service catalog, search
- **users** — profile management
- **reference** — service categories
- **locations** — Philippine locations reference data

**Auth guard**: `src/modules/auth/guards/supabase-auth.guard.ts` — validates JWT from `Authorization: Bearer <token>` header, attaches `req.user`. Applied via `@UseGuards(SupabaseAuthGuard)`.

**Global ValidationPipe** is enabled in `src/main.ts` for automatic DTO validation.

## API Conventions

- Route pattern: `/api/{feature}/v{version}/{action}`
- Versioning: `v1` for stable, `v2` for updated endpoints (e.g., provider registration with KYC)
- Standard response shape: `{ status, message, data, [access_token], [user_id], [role] }`
- Error handling uses NestJS exceptions: `BadRequestException`, `NotFoundException`, `UnauthorizedException`

## Code Style

- Prettier: single quotes, trailing commas (configured in `.prettierrc`)
- ESLint: flat config in `eslint.config.mjs` — `@typescript-eslint/no-explicit-any` is off, `no-floating-promises` and `no-unsafe-argument` are warnings
- DTOs use class-validator decorators (`@IsString`, `@IsEmail`, `@IsUUID`, `@IsStrongPassword`, etc.)
- Password requirements: 8+ chars, uppercase, lowercase, number, special character
- File uploads: max 5MB, image/jpeg/jpg/png only

## Key Database Tables

users, customer_profiles, provider_profiles, provider_documents, bookings, payments, reviews, provider_services, service_categories. Supabase storage bucket `verification-docs` holds KYC files.

## Testing

Jest with ts-jest. Unit tests co-located as `*.spec.ts`. E2E tests in `test/` directory using supertest. Test modules use `Test.createTestingModule()` for dependency injection.
