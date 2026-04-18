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

export function sendWithTimeout<T>(
  source: Observable<T>,
  timeoutMs: number = DEFAULT_KAFKA_TIMEOUT_MS,
): Promise<T> {
  return lastValueFrom(
    source.pipe(
      timeout({ each: timeoutMs }),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          const correlationId = getCorrelationId();
          logger.error(
            `[${correlationId}] Upstream microservice did not reply within ${timeoutMs}ms`,
          );
          return throwError(
            () =>
              new HttpException(
                'Upstream service unavailable (request timed out)',
                HttpStatus.GATEWAY_TIMEOUT,
              ),
          );
        }
        return throwError(() => err);
      }),
    ),
  );
}
