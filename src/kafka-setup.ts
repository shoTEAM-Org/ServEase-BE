import { Kafka } from 'kafkajs';
import {
  AUTH_PATTERNS,
  BOOKING_PATTERNS,
  PAYMENT_PATTERNS,
  PROVIDER_PATTERNS,
  CUSTOMER_PATTERNS,
  ADMIN_PATTERNS,
  CATALOG_PATTERNS,
} from '@app/common';

const SETUP_MAX_RETRIES = 30;
const SETUP_RETRY_DELAY_MS = 3000;

/**
 * Waits for the Kafka broker to be fully ready (able to serve metadata),
 * then pre-creates all request and reply topics so gateway consumers
 * don't fail with UNKNOWN_TOPIC_OR_PARTITION on cold start.
 */
export async function ensureKafkaTopics(): Promise<void> {
  const brokers = [process.env.KAFKA_BROKER || 'localhost:9092'];

  const patterns = [
    ...Object.values(AUTH_PATTERNS),
    ...Object.values(BOOKING_PATTERNS),
    ...Object.values(PAYMENT_PATTERNS),
    ...Object.values(PROVIDER_PATTERNS),
    ...Object.values(CUSTOMER_PATTERNS),
    ...Object.values(ADMIN_PATTERNS),
    ...Object.values(CATALOG_PATTERNS),
  ];

  const topicNames = patterns.flatMap((p) => [p, `${p}.reply`]);

  const kafka = new Kafka({
    clientId: 'gateway-topic-setup',
    brokers,
    retry: { initialRetryTime: 1000, retries: 5 },
  });
  const admin = kafka.admin();

  for (let attempt = 1; attempt <= SETUP_MAX_RETRIES; attempt++) {
    try {
      await admin.connect();

      // Create topics (returns false if they already exist, which is fine)
      await admin.createTopics({
        waitForLeaders: true,
        topics: topicNames.map((topic) => ({
          topic,
          numPartitions: 1,
          replicationFactor: 1,
        })),
      });

      // Verify broker can actually serve metadata for the topics
      const metadata = await admin.fetchTopicMetadata({ topics: topicNames });
      const allReady = metadata.topics.every(
        (t) => t.partitions.length > 0 && t.partitions.every((p) => p.leader >= 0),
      );

      if (!allReady) {
        throw new Error('Topics created but partitions not yet assigned to a leader');
      }

      await admin.disconnect();
      console.log(`Kafka topics ready (${topicNames.length} topics)`);
      return;
    } catch (error) {
      try { await admin.disconnect(); } catch { /* ignore disconnect errors */ }

      if (attempt < SETUP_MAX_RETRIES) {
        console.warn(
          `Waiting for Kafka broker (attempt ${attempt}/${SETUP_MAX_RETRIES}): ${error.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, SETUP_RETRY_DELAY_MS));
      } else {
        throw new Error(`Kafka broker not ready after ${SETUP_MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }
}
