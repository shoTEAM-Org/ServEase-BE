import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import {
  Observable,
  TimeoutError,
  catchError,
  throwError,
  timeout,
} from 'rxjs';

const logger = new Logger('GatewayTimeout');
const parsedRequestTimeoutMs = Number(process.env.GATEWAY_REQUEST_TIMEOUT_MS);
const REQUEST_TIMEOUT_MS =
  Number.isFinite(parsedRequestTimeoutMs) && parsedRequestTimeoutMs > 0
    ? parsedRequestTimeoutMs
    : 20_000;

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      timeout(REQUEST_TIMEOUT_MS),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          logger.error(
            `HTTP request timed out after ${REQUEST_TIMEOUT_MS}ms`,
          );
          return throwError(
            () =>
              new RequestTimeoutException(
                'Upstream service did not respond in time',
              ),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
