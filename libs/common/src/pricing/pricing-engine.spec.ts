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
      distanceLaborAllowance: 0,
      operatingBuffer: 50,
      fairEstimate: 1050,
      fairMin: 1050,
      fairMax: 1050,
      fairnessBand: 'fair',
      confidence: 'low',
      fuel: {
        fuelType: 'gasoline',
        pricePerLiter: 65,
        freshness: 'fresh'
      }
    });
  });

  it('uses hourly labor and marks prices above the fair range as high', () => {
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
    expect(quote.fairEstimate).toBe(1050);
    expect(quote.fairnessBand).toBe('high');
  });

  it('adds round-trip travel, distance labor, and operating buffer for far radius tier', () => {
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

    expect(quote.distanceKm).toBe(30);
    expect(quote.roundTripKm).toBe(75);
    expect(quote.travelAdjustment).toBe(525);
    expect(quote.distanceLaborAllowance).toBe(150);
    expect(quote.operatingBuffer).toBe(83.75);
    expect(quote.fairEstimate).toBe(1758.75);
    expect(quote.fairnessBand).toBe('below_estimate');
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

    expect(quote.travelAdjustment).toBe(42.67);
    expect(quote.distanceLaborAllowance).toBe(60);
    expect(quote.fuel.freshness).toBe('stale');
    expect(quote.confidence).toBe('low');
    expect(quote.assumptions).toEqual(
      expect.arrayContaining([
        'Using default motorcycle gasoline travel profile.',
        'Fuel baseline is stale; estimate uses the last known value.'
      ])
    );
  });

  it('uses a category labor baseline when available', () => {
    const quote = calculatePricingQuote({
      pricingMode: 'flat',
      providerPrice: 1600,
      hoursRequired: 1,
      bookingAmount: 1600,
      radiusTier: 'base',
      distanceKm: 3,
      laborBaseline: {
        minLaborAmount: 900,
        maxLaborAmount: 1300,
        typicalLaborAmount: 1100,
        sourceNote: 'ServEase cleaning baseline'
      },
      fuel: {
        fuelType: 'gasoline',
        pricePerLiter: 87.69,
        sourceName: 'GasWatch PH / DOE weekly advisory',
        fetchedAt: '2026-05-01T00:00:00.000Z',
        freshness: 'fresh'
      }
    });
    expect(quote.laborAmount).toBe(1600);
    expect(quote.benchmarkLaborAmount).toBe(1100);
    expect(quote.laborBaseline).toMatchObject({
      minLaborAmount: 900,
      maxLaborAmount: 1300,
      typicalLaborAmount: 1100
    });
    expect(quote.fairMin).toBe(986.09);
    expect(quote.fairEstimate).toBe(1186.09);
    expect(quote.fairMax).toBe(1386.09);
    expect(quote.fairnessBand).toBe('high');
    expect(quote.confidence).toBe('high');
    expect(quote.assumptions).toContain('Using category labor benchmark: ServEase cleaning baseline.');
  });

  it('prefers geolocation coordinates when computing travel distance', () => {
    const quote = calculatePricingQuote({
      pricingMode: 'flat',
      providerPrice: 1000,
      hoursRequired: 1,
      bookingAmount: 1200,
      radiusTier: 'base',
      distanceKm: 99,
      providerCoordinates: { latitude: 14.5995, longitude: 120.9842 },
      serviceCoordinates: { latitude: 14.6095, longitude: 120.9942 },
      fuel: {
        fuelType: 'gasoline',
        pricePerLiter: 70,
        sourceName: 'Test fuel source',
        fetchedAt: '2026-05-01T00:00:00.000Z',
        freshness: 'fresh'
      }
    });

    expect(quote.distanceKm).toBeLessThan(99);
    expect(quote.distanceKm).toBeGreaterThan(1);
    expect(quote.assumptions).toContain(
      'Travel distance uses provider base coordinates and the service address coordinates.'
    );
  });
});
