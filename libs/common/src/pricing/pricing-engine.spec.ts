import { calculatePricingQuote } from './pricing-engine';

describe('calculatePricingQuote', () => {
  it('classifies a flat booking as fair when provider price matches the estimate', () => {
    const quote = calculatePricingQuote({
      pricingMode: 'flat',
      providerPrice: 1000,
      hoursRequired: 3,
      bookingAmount: 1000,
      radiusTier: 'base',
      fuel: {
        fuelType: 'gasoline',
        pricePerLiter: 65,
        sourceName: 'Test fuel source',
        fetchedAt: '2026-05-01T00:00:00.000Z',
        freshness: 'fresh'
      }
    });

    expect(quote).toMatchObject({
      bookingAmount: 1000,
      laborAmount: 1000,
      travelAdjustment: 0,
      operatingBuffer: 0,
      fairEstimate: 1000,
      fairnessBand: 'fair',
      fuel: {
        fuelType: 'gasoline',
        pricePerLiter: 65,
        freshness: 'fresh'
      }
    });
  });

  it('uses hourly labor and marks prices above 135 percent of estimate as high', () => {
    const quote = calculatePricingQuote({
      pricingMode: 'hourly',
      providerPrice: 500,
      hoursRequired: 2,
      bookingAmount: 1800,
      radiusTier: 'base',
      fuel: {
        fuelType: 'diesel',
        pricePerLiter: 60,
        sourceName: 'Test fuel source',
        fetchedAt: '2026-05-01T00:00:00.000Z',
        freshness: 'fresh'
      }
    });

    expect(quote.laborAmount).toBe(1000);
    expect(quote.fairEstimate).toBe(1000);
    expect(quote.fairnessBand).toBe('high');
  });

  it('adds travel and operating buffer for far radius tier with vehicle assumptions', () => {
    const quote = calculatePricingQuote({
      pricingMode: 'flat',
      providerPrice: 1000,
      hoursRequired: 1,
      bookingAmount: 1400,
      radiusTier: 'far',
      vehicle: {
        vehicleType: 'car',
        fuelType: 'gasoline',
        fuelEfficiencyKmPerLiter: 10
      },
      fuel: {
        fuelType: 'gasoline',
        pricePerLiter: 70,
        sourceName: 'Test fuel source',
        fetchedAt: '2026-05-01T00:00:00.000Z',
        freshness: 'fresh'
      }
    });

    expect(quote.travelAdjustment).toBe(210);
    expect(quote.operatingBuffer).toBe(60.5);
    expect(quote.fairEstimate).toBe(1270.5);
    expect(quote.fairnessBand).toBe('fair');
    expect(quote.assumptions).toContain('Far travel tier applied.');
  });

  it('reports stale fuel and default vehicle assumptions', () => {
    const quote = calculatePricingQuote({
      pricingMode: 'flat',
      providerPrice: 1000,
      hoursRequired: 1,
      bookingAmount: 1000,
      radiusTier: 'extended',
      fuel: {
        fuelType: 'gasoline',
        pricePerLiter: 64,
        sourceName: 'Fallback source',
        fetchedAt: '2026-04-29T00:00:00.000Z',
        freshness: 'stale'
      }
    });

    expect(quote.travelAdjustment).toBe(17.07);
    expect(quote.fuel.freshness).toBe('stale');
    expect(quote.assumptions).toEqual(
      expect.arrayContaining([
        'Using default motorcycle gasoline travel profile.',
        'Fuel baseline is stale; estimate uses the last known value.'
      ])
    );
  });
});
