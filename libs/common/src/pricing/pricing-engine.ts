export type PricingMode = 'flat' | 'hourly';
export type FuelType = 'gasoline' | 'diesel';
export type VehicleType = 'motorcycle' | 'car' | 'van';
export type RadiusTier = 'base' | 'extended' | 'far' | 'outside';
export type FuelFreshness = 'fresh' | 'cached' | 'stale' | 'default';
export type FairnessBand = 'below_estimate' | 'fair' | 'slightly_above' | 'high';
export type PricingConfidence = 'high' | 'medium' | 'low';
export type JobComplexity = 'simple' | 'standard' | 'complex';
export type PricingUrgency = 'scheduled' | 'same_day' | 'urgent';

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

export type PricingCoordinates = {
  latitude: number;
  longitude: number;
};

export type CalculatePricingQuoteInput = {
  pricingMode: PricingMode;
  providerPrice: number;
  hoursRequired: number;
  bookingAmount?: number;
  radiusTier: RadiusTier;
  distanceKm?: number;
  serviceRadiusKm?: number;
  providerCoordinates?: PricingCoordinates;
  serviceCoordinates?: PricingCoordinates;
  jobComplexity?: JobComplexity;
  urgency?: PricingUrgency;
  vehicle?: Partial<PricingVehicleInput>;
  fuel: PricingFuelInput;
  laborBaseline?: PricingLaborBaselineInput;
  providerBaseMissing?: boolean;
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
  fairMin: number;
  fairTypical: number;
  fairMax: number;
  fairnessBand: FairnessBand;
  confidence: PricingConfidence;
  laborAmount: number;
  benchmarkLaborAmount: number;
  laborBaseline?: PricingLaborBaselineInput;
  travelTier: RadiusTier;
  distanceKm?: number;
  roundTripKm: number;
  travelAdjustment: number;
  distanceLaborAllowance: number;
  operatingBuffer: number;
  jobComplexity: JobComplexity;
  urgency: PricingUrgency;
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
const ROAD_DISTANCE_FACTOR = 1.25;
const ROUND_TRIP_MULTIPLIER = 2;
const DISTANCE_LABOR_ALLOWANCE_PER_KM = 2;

const COMPLEXITY_MULTIPLIER: Record<JobComplexity, number> = {
  simple: 0.9,
  standard: 1,
  complex: 1.25
};

const URGENCY_MULTIPLIER: Record<PricingUrgency, number> = {
  scheduled: 1,
  same_day: 1.1,
  urgent: 1.25
};

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function positiveNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function nonNegativeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : fallback;
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

function normalizeComplexity(value?: JobComplexity): JobComplexity {
  return value && COMPLEXITY_MULTIPLIER[value] ? value : 'standard';
}

function normalizeUrgency(value?: PricingUrgency): PricingUrgency {
  return value && URGENCY_MULTIPLIER[value] ? value : 'scheduled';
}

function fairnessBand(bookingAmount: number, fairMin: number, fairMax: number): FairnessBand {
  if (fairMax <= 0) return 'fair';
  if (bookingAmount < fairMin * 0.9) return 'below_estimate';
  if (bookingAmount <= fairMax) return 'fair';
  if (bookingAmount <= fairMax * 1.15) return 'slightly_above';
  return 'high';
}

function confidence(input: CalculatePricingQuoteInput, distanceKm: number): PricingConfidence {
  if (!input.laborBaseline || input.providerBaseMissing || input.fuel.freshness === 'default') {
    return 'low';
  }
  if (distanceKm <= 0 || input.fuel.freshness === 'stale') {
    return 'medium';
  }
  return 'high';
}

function haversineKm(
  origin?: PricingCoordinates,
  destination?: PricingCoordinates
) {
  if (!origin || !destination) return undefined;

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(destination.latitude - origin.latitude);
  const deltaLon = toRadians(destination.longitude - origin.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(destination.latitude)) *
      Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculatePricingQuote(input: CalculatePricingQuoteInput): PricingQuote {
  const hoursRequired = Math.max(1, positiveNumber(input.hoursRequired, 1));
  const providerPrice = positiveNumber(input.providerPrice);
  const jobComplexity = normalizeComplexity(input.jobComplexity);
  const urgency = normalizeUrgency(input.urgency);
  const adjustmentMultiplier = COMPLEXITY_MULTIPLIER[jobComplexity] * URGENCY_MULTIPLIER[urgency];
  const laborAmount = roundMoney(
    input.pricingMode === 'hourly' ? providerPrice * hoursRequired : providerPrice
  );
  const baselineMin = positiveNumber(input.laborBaseline?.minLaborAmount, laborAmount);
  const baselineTypical = positiveNumber(input.laborBaseline?.typicalLaborAmount, laborAmount);
  const baselineMax = positiveNumber(input.laborBaseline?.maxLaborAmount, laborAmount);
  const fairLaborMin = roundMoney(baselineMin * adjustmentMultiplier);
  const benchmarkLaborAmount = roundMoney(baselineTypical * adjustmentMultiplier);
  const fairLaborMax = roundMoney(Math.max(baselineMax, baselineTypical, baselineMin) * adjustmentMultiplier);
  const bookingAmount = roundMoney(input.bookingAmount ?? laborAmount);
  const vehicle = normalizeVehicle(input.vehicle);
  const fuelPrice = positiveNumber(input.fuel.pricePerLiter);
  const fallbackTierKm = TIER_KM[input.radiusTier] ?? 0;
  const geolocationDistanceKm = haversineKm(input.providerCoordinates, input.serviceCoordinates);
  const oneWayDistanceKm = roundMoney(nonNegativeNumber(geolocationDistanceKm ?? input.distanceKm, fallbackTierKm));
  const roundTripKm = roundMoney(oneWayDistanceKm * ROAD_DISTANCE_FACTOR * ROUND_TRIP_MULTIPLIER);
  const travelAdjustment = roundMoney(
    roundTripKm > 0 ? (roundTripKm / vehicle.fuelEfficiencyKmPerLiter) * fuelPrice : 0
  );
  const distanceLaborAllowance = roundMoney(roundTripKm * DISTANCE_LABOR_ALLOWANCE_PER_KM);
  const operatingBuffer = roundMoney(
    (benchmarkLaborAmount + travelAdjustment + distanceLaborAllowance) * OPERATING_BUFFER_RATE
  );
  const fairMin = roundMoney(fairLaborMin + travelAdjustment + distanceLaborAllowance + operatingBuffer);
  const fairEstimate = roundMoney(benchmarkLaborAmount + travelAdjustment + distanceLaborAllowance + operatingBuffer);
  const fairMax = roundMoney(fairLaborMax + travelAdjustment + distanceLaborAllowance + operatingBuffer);
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
  if (geolocationDistanceKm !== undefined) {
    assumptions.push('Travel distance uses provider base coordinates and the service address coordinates.');
  }
  assumptions.push(`Job complexity is ${jobComplexity}.`);
  assumptions.push(`Urgency is ${urgency.replace(/_/g, ' ')}.`);
  if (oneWayDistanceKm > 0) {
    assumptions.push(`Travel uses ${oneWayDistanceKm.toFixed(2)} km one-way estimated distance and round-trip return assumption.`);
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
    fairMin,
    fairTypical: fairEstimate,
    fairMax,
    fairnessBand: fairnessBand(bookingAmount, fairMin, fairMax),
    confidence: confidence(input, oneWayDistanceKm),
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
    distanceKm: oneWayDistanceKm,
    roundTripKm,
    travelAdjustment,
    distanceLaborAllowance,
    operatingBuffer,
    jobComplexity,
    urgency,
    vehicle,
    fuel: {
      ...input.fuel,
      pricePerLiter: roundMoney(fuelPrice)
    },
    assumptions,
    explanation: [
      `Provider labor is ${laborAmount.toFixed(2)}.`,
      `Fair labor range is ${fairLaborMin.toFixed(2)} to ${fairLaborMax.toFixed(2)}.`,
      `Provider base is ${oneWayDistanceKm.toFixed(2)} km from the service location.`,
      `Travel adjustment is ${travelAdjustment.toFixed(2)} for ${roundTripKm.toFixed(2)} km round trip.`,
      `Distance labor allowance is ${distanceLaborAllowance.toFixed(2)}.`,
      `Operating buffer is ${operatingBuffer.toFixed(2)}.`
    ]
  };
}

export const PricingEngine = {
  quote(input: Partial<CalculatePricingQuoteInput> = {} as Partial<CalculatePricingQuoteInput>) : PricingQuote & { total_amount: number } {
    const result = calculatePricingQuote(input as CalculatePricingQuoteInput);
    return {
      ...result,
      total_amount: Number(result.bookingAmount || 0),
    } as PricingQuote & { total_amount: number };
  }
};
