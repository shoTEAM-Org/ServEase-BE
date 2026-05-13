# ServEase Implementation Checklist

This checklist is superseded by the current end-to-end alignment spec:

- `../ServEase-MB/SPEC.md`

The previous phase-9 and phase-10 verifier references were removed because the
current backend verifier set is:

```bash
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

Current status is tracked in `SPEC.md` runtime notes. Active architecture rules:
one schema per service, gateway REST at `:5000`, Kafka for cross-service calls,
and live Supabase as the source of truth.
