import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseRpcExceptionFilter, KafkaContext } from '@nestjs/microservices';

@Catch()
export class RpcLoggingFilter extends BaseRpcExceptionFilter {
  private readonly logger = new Logger(RpcLoggingFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    try {
      const rpc = host.switchToRpc();
      const context = rpc.getContext<KafkaContext>();
      const pattern = (context as any)?.getPattern?.() ?? 'unknown-pattern';
      const data = rpc.getData?.();

      const message =
        exception instanceof Error
          ? exception.message
          : typeof exception === 'string'
            ? exception
            : JSON.stringify(exception);

      this.logger.error(
        `RPC handler failed (${String(pattern)}): ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );

      // Log payload at debug-level to avoid leaking data by default.
      this.logger.debug(
        `RPC payload (${String(pattern)}): ${safeJson(data)}`,
      );
    } catch (logError) {
      this.logger.error(
        `Failed to log RPC exception: ${String(
          (logError as any)?.message || logError,
        )}`,
      );
    }

    return super.catch(exception, host);
  }
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

