# DOE Fuel Baseline Update

ServEase pricing quotes use `booking.fuel_price_cache` for the Philippines fuel baseline. For v1, prefer the cached GasWatchPH updater, then fall back to manual DOE OIMB values if parsing fails or the source is unavailable.

## GasWatchPH Cache Update

Run from `ServEase-BE`:

```bash
npm run fuel:gaswatchph
```

This fetches `https://gaswatchph.com/`, parses Metro Manila average diesel and unleaded prices, and inserts them into `booking.fuel_price_cache` with source `GasWatch PH / DOE weekly advisory`.

Use dry-run mode before changing data:

```bash
npm run fuel:gaswatchph -- --dry-run
```

The GasWatchPH updater is a cache warmer, not a runtime dependency. Booking quotes still read from Supabase cache, so a temporary source failure does not break booking.

## Manual DOE Fallback

Run from `ServEase-BE`:

```bash
npm run fuel:baseline -- --gasoline 64.50 --diesel 58.20 --source-url https://staging.doe.gov.ph/site/oimb
```

Optional arguments:

- `--source-name "DOE OIMB weekly fuel advisory"`
- `--source-url https://...`
- `--fetched-at 2026-05-01T00:00:00+08:00`

The manual script:

- reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from `ServEase-BE/.env`
- inserts gasoline and/or diesel rows into `booking.fuel_price_cache`
- marks the baseline valid for seven days
- stores a small `raw_payload` marker showing the row was manually seeded from a DOE baseline

If this cache is empty, the booking service falls back to configured/default fuel prices. Keep this baseline current so customer-facing price fairness explanations can cite a recent Philippines source.
