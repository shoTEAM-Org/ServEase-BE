import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class KafkaLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Kafka');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const rpcContext = context.switchToRpc();
    const pattern = context.getHandler().name;
    const data = rpcContext.getData();

    this.logger.log(`>> Received [${pattern}] ${JSON.stringify(data).slice(0, 200)}`);

    const now = Date.now();
    return next.handle().pipe(
      tap((response) => {
        const duration = Date.now() - now;
        this.logger.log(`<< Response [${pattern}] ${duration}ms`);
      }),
    );
  }
}
