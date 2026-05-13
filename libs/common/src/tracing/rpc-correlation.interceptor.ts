import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  extractCorrelationIdFromPayload,
  extractSourceFromPayload,
  runWithCorrelationContext,
} from './correlation.js';

@Injectable()
export class RpcCorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const payload = context.switchToRpc().getData();
    const correlationId = extractCorrelationIdFromPayload(payload);
    const source = extractSourceFromPayload(payload);

    return runWithCorrelationContext(correlationId, source, () =>
      next.handle(),
    );
  }
}
