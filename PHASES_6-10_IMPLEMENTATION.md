# Historical Implementation Guide

This guide is superseded by `../ServEase-MB/SPEC.md`.

The current release scope is DB-aligned and intentionally excludes the removed
features listed in the spec, including provider portfolio, counter-offers,
reschedule requests, notification preferences, commission rules, promotions,
refund policies, platform settings, and non-service-provider verticals.

Current backend verification:

```bash
npm run build
node scripts/check-schema-boundaries.cjs
node scripts/db-inspect.js
node scripts/phase1-verify.js
node scripts/phase2-verify.js
node scripts/phase3-verify.js
node scripts/phase4-verify.js
node scripts/phase5-verify.js
node scripts/phase6-verify.js
node scripts/phase7-verify.js
node scripts/phase8-verify.js
node scripts/e2e-golden-path.js
```

For HTTP routes, use `API-Endpoints.md`. For frontend integration notes, use
`FRONTEND_INTEGRATION_GUIDE.md`.
