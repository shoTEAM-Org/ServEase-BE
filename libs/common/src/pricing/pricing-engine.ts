export type PricingMode = 'flat' | 'hourly';
export type FuelType = 'gasoline' | 'diesel';
export type VehicleType = 'motorcycle' | 'car' | 'van';
export type RadiusTier = 'base' | 'extended' | 'far' | 'outside';
export type FuelFreshness = 'fresh' | 'cached' | 'stale' | 'default';
export type FairnessBand = 'below_estimate' | 'fair' | 'slightly_above' | 'high';

export type PricingFuelInput = {
  fuelType: FuelType;
  pricePerLiter: number;
  sourceName: string;
  sourceUrl?: string;
  fetchedAt: string;
  freshness: FuelFreshness;
};

export type PricingVehicleInput = {
  vehicleType: VehicleType;
  fuelType: FuelType;
  fuelEfficiencyKmPerLiter: number;
};

export type CalculatePricingQuoteInput = {
  pricingMode: PricingMode;
  providerPrice: number;
  hoursRequired: number;
  bookingAmount?: number;
  radiusTier: RadiusTier;
  vehicle?: Partial<PricingVehicleInput>;
  fuel: PricingFuelInput;
  laborBaseline?: PricingLaborBaselineInput;
};

export type PricingLaborBaselineInput = {
  minLaborAmount: number;
  maxLaborAmount: number;
  typicalLaborAmount: number;
  sourceNote?: string;
};

export type PricingQuote = {
  bookingAmount: number;
  fairEstimate: number;
  fairnessBand: FairnessBand;
  laborAmount: number;
  benchmarkLaborAmount: number;
  laborBaseline?: PricingLaborBaselineInput;
  travelTier: RadiusTier;
  travelAdjustment: number;
  operatingBuffer: number;
  vehicle: PricingVehicleInput;
  fuel: PricingFuelInput;
  assumptions: string[];
  explanation: string[];
};

const DEFAULT_VEHICLE: PricingVehicleInput = {
  vehicleType: 'motorcycle',
  fuelType: 'gasoline',
  fuelEfficiencyKmPerLiter: 45
};

const TIER_KM: Record<RadiusTier, number> = {
  base: 0,
  extended: 12,
  far: 30,
  outside: 45
};

const TIER_LABELS: Record<RadiusTier, string> = {
  base: 'Within provider normal service radius.',
  extended: 'Extended travel tier applied.',
  far: 'Far travel tier applied.',
  outside: 'Outside normal service radius tier applied.'
};

const OPERATING_BUFFER_RATE = 0.05;

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function positiveNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function normalizeVehicle(vehicle?: Partial<PricingVehicleInput>) {
  return {
    vehicleType: vehicle?.vehicleType || DEFAULT_VEHICLE.vehicleType,
    fuelType: vehicle?.fuelType || DEFAULT_VEHICLE.fuelType,
    fuelEfficiencyKmPerLiter: positiveNumber(
      vehicle?.fuelEfficiencyKmPerLiter,
      DEFAULT_VEHICLE.fuelEfficiencyKmPerLiter
    )
  };
}

function fairnessBand(bookingAmount: number, fairEstimate: number): FairnessBand {
  if (fairEstimate <= 0) return 'fair';
  const ratio = bookingAmount / fairEstimate;
  if (ratio < 0.9) return 'below_estimate';
  if (ratio <= 1.15) return 'fair';
  if (ratio <= 1.35) return 'slightly_above';
  return 'high';
}

export function calculatePricingQuote(input: CalculatePricingQuoteInput): PricingQuote {
  const hoursRequired = Math.max(1, positiveNumber(input.hoursRequired, 1));
  const providerPrice = positiveNumber(input.providerPrice);
  const laborAmount = roundMoney(
    input.pricingMode === 'hourly' ? providerPrice * hoursRequired : providerPrice
  );
  const baselineTypical = positiveNumber(input.laborBaseline?.typicalLaborAmount);
  const benchmarkLaborAmount = roundMoney(baselineTypical || laborAmount);
  const bookingAmount = roundMoney(input.bookingAmount ?? laborAmount);
  const vehicle = normalizeVehicle(input.vehicle);
  const fuelPrice = positiveNumber(input.fuel.pricePerLiter);
  const tierKm = TIER_KM[input.radiusTier] ?? 0;
  const travelAdjustment = roundMoney(
    tierKm > 0 ? (tierKm / vehicle.fuelEfficiencyKmPerLiter) * fuelPrice : 0
  );
  const operatingBuffer = roundMoney(
    travelAdjustment > 0 ? (benchmarkLaborAmount + travelAdjustment) * OPERATING_BUFFER_RATE : 0
  );
  const fairEstimate = roundMoney(benchmarkLaborAmount + travelAdjustment + operatingBuffer);
  const assumptions = [TIER_LABELS[input.radiusTier]];

  if (input.laborBaseline) {
    assumptions.push(
      `Using category labor benchmark: ${input.laborBaseline.sourceNote || 'ServEase category baseline'}.`
    );
  } else {
    assumptions.push('No category labor benchmark available; using provider labor price.');
  }
  if (!input.vehicle) {
    assumptions.push('Using default motorcycle gasoline travel profile.');
  }
  if (input.fuel.freshness === 'stale') {
    assumptions.push('Fuel baseline is stale; estimate uses the last known value.');
  }
  if (input.fuel.freshness === 'default') {
    assumptions.push('Fuel baseline uses a configured default.');
  }

  return {
    bookingAmount,
    fairEstimate,
    fairnessBand: fairnessBand(bookingAmount, fairEstimate),
    laborAmount,
    benchmarkLaborAmount,
    laborBaseline: input.laborBaseline
      ? {
          minLaborAmount: roundMoney(input.laborBaseline.minLaborAmount),
          maxLaborAmount: roundMoney(input.laborBaseline.maxLaborAmount),
          typicalLaborAmount: roundMoney(input.laborBaseline.typicalLaborAmount),
          sourceNote: input.laborBaseline.sourceNote,
        }
      : undefined,
    travelTier: input.radiusTier,
    travelAdjustment,
    operatingBuffer,
    vehicle,
    fuel: {
      ...input.fuel,
      pricePerLiter: roundMoney(fuelPrice)
    },
    assumptions,
    explanation: [
      `Provider labor is ${laborAmount.toFixed(2)}.`,
      `Benchmark labor is ${benchmarkLaborAmount.toFixed(2)}.`,
      `Travel adjustment is ${travelAdjustment.toFixed(2)} for the ${input.radiusTier} radius tier.`,
      `Operating buffer is ${operatingBuffer.toFixed(2)}.`
    ]
  };
}
