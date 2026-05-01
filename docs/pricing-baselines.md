# Pricing Baseline Updates

ServEase price fairness uses `provider_catalog.service_pricing_baselines` to compare provider labor prices against category-level labor benchmarks.

## Update From JSON

Edit `scripts/pricing-baselines.example.json`, then run a dry run:

```bash
npm run pricing:baselines -- --file scripts/pricing-baselines.example.json --dry-run
```

Apply the baselines:

```bash
npm run pricing:baselines -- --file scripts/pricing-baselines.example.json
```

Each item needs:

- `slug` or `serviceId`
- `pricingMode`: `flat` or `hourly`
- `minLaborAmount`
- `maxLaborAmount`
- `typicalLaborAmount`
- `sourceNote`

The pricing engine uses `typicalLaborAmount` as the labor benchmark. The min/max range is shown to customers as context. If a category has no baseline, the engine falls back to the provider's own labor price and marks that assumption in the quote.

## Choosing Ranges

Use conservative starting values and adjust after reviewing real booking outcomes. Do not make the range too narrow early; the goal is to flag clearly unusual prices, not penalize normal provider variation.

Recommended review cadence:

- update manually when adding a service category
- review ranges monthly while marketplace data is still sparse
- later, compare against completed booking medians before changing baselines
