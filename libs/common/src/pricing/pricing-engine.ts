export type PricingMode = 'flat' | 'hourly';

export interface PricingQuoteInput {
  pricing_mode?: unknown;
  pricingMode?: unknown;
  hourly_rate?: unknown;
  hourlyRate?: unknown;
  flat_rate?: unknown;
  flatRate?: unknown;
  hours_required?: unknown;
  hoursRequired?: unknown;
  total_amount?: unknown;
  totalAmount?: unknown;
  amount?: unknown;
}

export interface PricingQuote {
  pricing_mode: PricingMode;
  hourly_rate: number | null;
  flat_rate: number | null;
  hours_required: number;
  subtotal: number;
  platform_fee: number;
  provider_earnings: number;
  total_amount: number;
}

const PLATFORM_FEE_RATE = 0.1;

function toTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class PricingEngine {
  static readonly platformFeeRate = PLATFORM_FEE_RATE;

  static quote(input: PricingQuoteInput): PricingQuote {
    const requestedMode = toTrimmedString(
      input.pricing_mode ?? input.pricingMode,
    ).toLowerCase();
    const pricingMode: PricingMode =
      requestedMode === 'hourly' ? 'hourly' : 'flat';
    const hourlyRate = toNullableNumber(input.hourly_rate ?? input.hourlyRate);
    const flatRate = toNullableNumber(input.flat_rate ?? input.flatRate);
    const hoursRequired = Math.max(
      1,
      Number(toNullableNumber(input.hours_required ?? input.hoursRequired) || 1),
    );
    const explicitTotal = toNullableNumber(
      input.total_amount ?? input.totalAmount ?? input.amount,
    );

    const computedSubtotal =
      pricingMode === 'hourly'
        ? (hourlyRate || 0) * hoursRequired
        : flatRate || hourlyRate || 0;
    const subtotal = toMoney(
      computedSubtotal > 0 ? computedSubtotal : explicitTotal || 0,
    );
    const platformFee = toMoney(subtotal * PLATFORM_FEE_RATE);

    return {
      pricing_mode: pricingMode,
      hourly_rate: hourlyRate,
      flat_rate: flatRate,
      hours_required: hoursRequired,
      subtotal,
      platform_fee: platformFee,
      provider_earnings: toMoney(Math.max(0, subtotal - platformFee)),
      total_amount: subtotal,
    };
  }
}
