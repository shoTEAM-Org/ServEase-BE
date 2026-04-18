import { Logger } from '@nestjs/common';
import { attachTraceMetadata } from './correlation.js';
import { RpcCorrelationInterceptor } from './rpc-correlation.interceptor.js';

const logger = new Logger('KafkaTracing');
const patchedClients = new WeakSet<object>();

type KafkaMethodName = 'send' | 'emit';

function patchKafkaMethod(
  client: Record<string, unknown>,
  methodName: KafkaMethodName,
  sourceName: string,
) {
  const originalMethod = client[methodName];
  if (typeof originalMethod !== 'function') return;

  client[methodName] = function patchedKafkaMethod(
    this: unknown,
    pattern: unknown,
    payload: unknown,
    ...rest: unknown[]
  ) {
    const tracedPayload = attachTraceMetadata(payload, sourceName);
    return (originalMethod as (...args: unknown[]) => unknown).call(
      this,
      pattern,
      tracedPayload,
      ...rest,
    );
  };
}

export function patchKafkaClientTracing(
  kafkaClient: unknown,
  sourceName: string,
): void {
  if (!kafkaClient || typeof kafkaClient !== 'object') return;
  if (patchedClients.has(kafkaClient)) return;

  const client = kafkaClient as Record<string, unknown>;
  patchKafkaMethod(client, 'send', sourceName);
  patchKafkaMethod(client, 'emit', sourceName);

  patchedClients.add(kafkaClient);
  logger.log(`Tracing enabled for Kafka client (${sourceName})`);
}

function hasProviderToken(app: unknown, token: string): boolean {
  if (!app || typeof app !== 'object') return false;

  const containerHolder = app as {
    container?: {
      getModules?: () =>
        | Map<unknown, { providers?: Map<unknown, unknown> }>
        | undefined;
    };
  };

  const modules = containerHolder.container?.getModules?.();
  if (!modules || typeof modules.values !== 'function') return false;

  for (const moduleRef of modules.values()) {
    const providers = moduleRef?.providers;
    if (!providers || typeof providers.has !== 'function') continue;
    if (providers.has(token)) return true;
  }

  return false;
}

function getKafkaClientFromApp(app: unknown): unknown {
  if (!app || typeof app !== 'object') return null;
  const appLike = app as {
    get?: (token: string, options?: { strict?: boolean }) => unknown;
  };
  if (typeof appLike.get !== 'function') return null;
  if (!hasProviderToken(app, 'KAFKA_CLIENT')) return null;

  try {
    return appLike.get('KAFKA_CLIENT', { strict: false });
  } catch (error) {
    logger.warn(
      `Tracing could not access KAFKA_CLIENT provider: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
    return null;
  }
}

export function enableGatewayTracing(app: unknown, sourceName = 'gateway'): void {
  const kafkaClient = getKafkaClientFromApp(app);
  patchKafkaClientTracing(kafkaClient, sourceName);
}

export function enableMicroserviceTracing(
  app: unknown,
  sourceName: string,
): void {
  const appLike = app as {
    useGlobalInterceptors?: (...interceptors: unknown[]) => unknown;
  };

  if (typeof appLike?.useGlobalInterceptors === 'function') {
    appLike.useGlobalInterceptors(new RpcCorrelationInterceptor());
  }

  const kafkaClient = getKafkaClientFromApp(app);
  patchKafkaClientTracing(kafkaClient, sourceName);
}
