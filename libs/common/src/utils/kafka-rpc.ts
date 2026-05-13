import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, TimeoutError, lastValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { getCorrelationId } from '../tracing/correlation.js';

const parsedInterserviceTimeoutMs = Number(
  process.env.KAFKA_INTERSERVICE_TIMEOUT_MS,
);
const parsedInterserviceRetryCount = Number(
  process.env.KAFKA_INTERSERVICE_RETRIES,
);
const parsedInterserviceRetryDelayMs = Number(
  process.env.KAFKA_INTERSERVICE_RETRY_DELAY_MS,
);

export const DEFAULT_INTERSERVICE_TIMEOUT_MS =
  Number.isFinite(parsedInterserviceTimeoutMs) &&
  parsedInterserviceTimeoutMs > 0
    ? parsedInterserviceTimeoutMs
    : 6000;

export const DEFAULT_INTERSERVICE_RETRIES =
  Number.isFinite(parsedInterserviceRetryCount) &&
  parsedInterserviceRetryCount >= 0
    ? Math.floor(parsedInterserviceRetryCount)
    : 0;

export const DEFAULT_INTERSERVICE_RETRY_DELAY_MS =
  Number.isFinite(parsedInterserviceRetryDelayMs) &&
  parsedInterserviceRetryDelayMs >= 0
    ? Math.floor(parsedInterserviceRetryDelayMs)
    : 250;

export interface KafkaRpcRequestOptions {
  context?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  logger?: Logger;
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (!error || typeof error !== 'object') return false;
  const message = String((error as any).message || '').toLowerCase();
  return message.includes('timeout');
}

function extractRpcErrorPayload(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as any;
  const response = candidate.response;
  const statusCode = Number(candidate.statusCode ?? response?.statusCode);
  const message = String(
    candidate.message ?? response?.message ?? 'Upstream service failed',
  );

  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    return null;
  }

  return { statusCode, message };
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ResolvedKafkaRpcOptions {
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  context: string;
  logger: Logger;
  maxAttempts: number;
}

function resolveKafkaRpcOptions(
  options: KafkaRpcRequestOptions,
): ResolvedKafkaRpcOptions {
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : DEFAULT_INTERSERVICE_TIMEOUT_MS;
  const retries =
    Number.isFinite(options.retries) && Number(options.retries) >= 0
      ? Math.floor(Number(options.retries))
      : DEFAULT_INTERSERVICE_RETRIES;
  const retryDelayMs =
    Number.isFinite(options.retryDelayMs) && Number(options.retryDelayMs) >= 0
      ? Math.floor(Number(options.retryDelayMs))
      : DEFAULT_INTERSERVICE_RETRY_DELAY_MS;
  const context = String(options.context || 'kafka.request');
  const logger = options.logger || new Logger('KafkaRpc');

  return {
    timeoutMs,
    retries,
    retryDelayMs,
    context,
    logger,
    maxAttempts: retries + 1,
  };
}

export async function sendKafkaRpcRequest<T>(
  sourceFactory: () => Observable<T>,
  options: KafkaRpcRequestOptions = {},
): Promise<T> {
  const { timeoutMs, retryDelayMs, context, logger, maxAttempts } =
    resolveKafkaRpcOptions(options);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await lastValueFrom(
        sourceFactory().pipe(
          timeout({
            each: timeoutMs,
          }),
        ),
      );
    } catch (error) {
      if (isTimeoutError(error)) {
        const correlationId = getCorrelationId();
        if (attempt < maxAttempts) {
          logger.warn(
            `[${correlationId}] Timeout on [${context}] attempt ${attempt}/${maxAttempts}; retrying in ${retryDelayMs}ms`,
          );
          await sleep(retryDelayMs);
          continue;
        }

        logger.error(
          `[${correlationId}] Timeout on [${context}] after ${maxAttempts} attempt(s) (${timeoutMs}ms each)`,
        );
        throw new ServiceUnavailableException(
          `Upstream service timed out: ${context}`,
        );
      }

      const rpcPayload = extractRpcErrorPayload(error);
      if (rpcPayload) {
        throw new RpcException(rpcPayload);
      }

      throw error;
    }
  }

  throw new ServiceUnavailableException(
    `Upstream service unavailable: ${context}`,
  );
}
