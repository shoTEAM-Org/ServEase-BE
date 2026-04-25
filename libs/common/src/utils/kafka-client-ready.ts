import { Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

type KafkaClientInternals = {
  responsePatterns?: string[];
  getConsumerAssignments?: () => Record<string, unknown>;
};

export interface KafkaClientReadyOptions {
  context?: string;
  attempts?: number;
  retryDelayMs?: number;
  assignmentTimeoutMs?: number;
  requiredPatterns?: string[];
  requiredReplyTopics?: string[];
  logger?: Logger;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePatterns(patterns: unknown[] = []) {
  return Array.from(
    new Set(
      patterns
        .map((pattern) => String(pattern || '').trim())
        .filter(Boolean),
    ),
  );
}

function getReplyTopics(
  kafka: ClientKafka,
  options: Pick<KafkaClientReadyOptions, 'requiredPatterns' | 'requiredReplyTopics'>,
) {
  const internals = kafka as unknown as KafkaClientInternals;

  if (Array.isArray(internals.responsePatterns)) {
    internals.responsePatterns = normalizePatterns(internals.responsePatterns);
  }

  const explicitReplyTopics = normalizePatterns(options.requiredReplyTopics);
  if (explicitReplyTopics.length) return explicitReplyTopics;

  const patterns = normalizePatterns(
    options.requiredPatterns?.length
      ? options.requiredPatterns
      : internals.responsePatterns || [],
  );

  return patterns.map((pattern) =>
    pattern.endsWith('.reply') ? pattern : `${pattern}.reply`,
  );
}

async function getMissingReplyTopics(
  kafka: ClientKafka,
  replyTopics: string[],
  timeoutMs: number,
) {
  if (!replyTopics.length) return [];

  const internals = kafka as unknown as KafkaClientInternals;
  const deadline = Date.now() + timeoutMs;
  let missing = replyTopics;

  do {
    const assignments = internals.getConsumerAssignments?.() || {};
    missing = replyTopics.filter(
      (replyTopic) => assignments[replyTopic] === undefined,
    );
    if (!missing.length) return [];
    await sleep(250);
  } while (Date.now() < deadline);

  return missing;
}

export async function connectKafkaClientWithRetry(
  kafka: ClientKafka,
  options: KafkaClientReadyOptions = {},
) {
  const context = options.context || 'Kafka client';
  const logger = options.logger || new Logger(context);
  const attempts = Math.max(1, Math.floor(Number(options.attempts) || 6));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 1000);
  const assignmentTimeoutMs = Math.max(
    1000,
    Number(options.assignmentTimeoutMs) || 12000,
  );
  const replyTopics = getReplyTopics(kafka, options);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await kafka.connect();
      const missing = await getMissingReplyTopics(
        kafka,
        replyTopics,
        assignmentTimeoutMs,
      );
      if (!missing.length) return;

      lastError = new Error(
        `${context} reply topics were not assigned: ${missing.join(', ')}`,
      );
    } catch (error) {
      lastError = error;
    }

    await kafka.close().catch(() => undefined);

    if (attempt < attempts) {
      const delayMs = retryDelayMs * attempt;
      logger.warn(
        `${context} Kafka client was not ready on attempt ${attempt}/${attempts}; retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${context} Kafka client failed to connect`);
}
