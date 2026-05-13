import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Observable, lastValueFrom, throwError, TimeoutError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { getCorrelationId } from '@app/common';

const logger = new Logger('KafkaRequest');

const parsedTimeoutMs = Number(process.env.KAFKA_REQUEST_TIMEOUT_MS);
export const DEFAULT_KAFKA_TIMEOUT_MS =
  Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
    ? parsedTimeoutMs
    : 12_000;

function extractHttpError(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as any;
  const response = candidate.response;
  const statusCode = Number(candidate.statusCode ?? response?.statusCode);
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    return null;
  }

  const rawMessage = candidate.message ?? response?.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join('; ')
    : String(rawMessage || 'Upstream service failed');
  return { statusCode, message };
}

export function sendWithTimeout<T>(
  source: Observable<T>,
  timeoutMs: number = DEFAULT_KAFKA_TIMEOUT_MS,
  context = 'unknown-pattern',
): Promise<T> {
  return lastValueFrom(
    source.pipe(
      timeout({ each: timeoutMs }),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          const correlationId = getCorrelationId();
          logger.error(
            `[${correlationId}] Upstream microservice did not reply to ${context} within ${timeoutMs}ms`,
          );
          return throwError(
            () =>
              new HttpException(
                'Upstream service unavailable (request timed out)',
                HttpStatus.GATEWAY_TIMEOUT,
              ),
          );
        }
        const upstreamError = extractHttpError(err);
        if (upstreamError) {
          return throwError(
            () =>
              new HttpException(
                upstreamError.message,
                upstreamError.statusCode,
              ),
          );
        }
        return throwError(() => err);
      }),
    ),
  );
}
