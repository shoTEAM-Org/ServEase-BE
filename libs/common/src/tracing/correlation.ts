import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const TRACE_META_KEY = '__meta';
export const TRACE_SOURCE_META_KEY = 'source';

interface CorrelationContext {
  correlationId: string;
  source?: string;
}

const correlationStore = new AsyncLocalStorage<CorrelationContext>();

function toTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function normalizeSource(value: unknown): string | undefined {
  const candidate = toTrimmedString(value);
  if (!candidate) return undefined;
  return candidate.slice(0, 64);
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function normalizeCorrelationId(value: unknown): string {
  const candidate = toTrimmedString(value);
  if (!candidate) return createCorrelationId();

  // Keep IDs readable and transport-safe while accepting common UUID formats.
  if (/^[A-Za-z0-9._:-]{8,128}$/.test(candidate)) {
    return candidate;
  }

  return createCorrelationId();
}

export function runWithCorrelationContext<T>(
  correlationId: unknown,
  source: unknown,
  callback: () => T,
): T {
  const resolvedId = normalizeCorrelationId(correlationId);
  const resolvedSource = normalizeSource(source);
  return correlationStore.run(
    { correlationId: resolvedId, source: resolvedSource },
    callback,
  );
}

export function getCorrelationContext() {
  return correlationStore.getStore();
}

export function getCorrelationId(): string {
  const active = correlationStore.getStore();
  return active?.correlationId || createCorrelationId();
}

export function getCorrelationSource(): string | undefined {
  return correlationStore.getStore()?.source;
}

function getMetadataRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const metadata = (payload as Record<string, unknown>)[TRACE_META_KEY];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

export function extractCorrelationIdFromPayload(payload: unknown): string | null {
  const metadata = getMetadataRecord(payload);
  const candidateFromMetadata = metadata?.correlationId;
  if (candidateFromMetadata !== undefined) {
    return normalizeCorrelationId(candidateFromMetadata);
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const candidate = (payload as Record<string, unknown>).correlationId;
    if (candidate !== undefined) {
      return normalizeCorrelationId(candidate);
    }
  }

  return null;
}

export function extractSourceFromPayload(payload: unknown): string | undefined {
  const metadata = getMetadataRecord(payload);
  const fromMetadata = normalizeSource(metadata?.[TRACE_SOURCE_META_KEY]);
  if (fromMetadata) return fromMetadata;

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return normalizeSource((payload as Record<string, unknown>).source);
  }

  return undefined;
}

export function attachTraceMetadata<T>(payload: T, source?: string): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const existingMetadata = getMetadataRecord(record) || {};
  const metadata: Record<string, unknown> = { ...existingMetadata };
  metadata.correlationId = getCorrelationId();

  const resolvedSource = normalizeSource(source) || getCorrelationSource();
  if (resolvedSource) {
    metadata[TRACE_SOURCE_META_KEY] = resolvedSource;
  }

  return {
    ...record,
    [TRACE_META_KEY]: metadata,
  } as T;
}
