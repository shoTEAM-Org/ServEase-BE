import { Kafka } from 'kafkajs';
import {
  AUTH_PATTERNS,
  BOOKING_PATTERNS,
  CHAT_PATTERNS,
  PAYMENT_PATTERNS,
  PROVIDER_PATTERNS,
  CUSTOMER_PATTERNS,
  ADMIN_PATTERNS,
  CATALOG_PATTERNS,
  NOTIFICATION_PATTERNS,
  SUPPORT_PATTERNS,
  TRUST_PATTERNS,
} from './patterns.js';

export async function ensureKafkaTopics(broker?: string): Promise<void> {
  const brokerUrl = broker ?? process.env.KAFKA_BROKER ?? 'localhost:9092';
  const kafka = new Kafka({
    clientId: 'servease-topic-admin',
    brokers: [brokerUrl],
  });
  const admin = kafka.admin();

  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await admin.connect();
      break;
    } catch {
      if (attempt === 10)
        throw new Error(
          `Could not connect to Kafka at ${brokerUrl} after 10 attempts`,
        );
      console.log(
        `[kafka-setup] Kafka not ready (attempt ${attempt}/10), retrying in ${attempt * 1000}ms...`,
      );
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }

  const allPatterns = [
    ...Object.values(AUTH_PATTERNS),
    ...Object.values(BOOKING_PATTERNS),
    ...Object.values(CHAT_PATTERNS),
    ...Object.values(PAYMENT_PATTERNS),
    ...Object.values(PROVIDER_PATTERNS),
    ...Object.values(CUSTOMER_PATTERNS),
    ...Object.values(ADMIN_PATTERNS),
    ...Object.values(CATALOG_PATTERNS),
    ...Object.values(NOTIFICATION_PATTERNS),
    ...Object.values(SUPPORT_PATTERNS),
    ...Object.values(TRUST_PATTERNS),
  ];

  // Include reply topics so the gateway's request-reply consumer never hits UNKNOWN_TOPIC_OR_PARTITION
  const allTopics = [
    ...new Set([...allPatterns, ...allPatterns.map((p) => `${p}.reply`)]),
  ];

  try {
    const existingTopics = await admin.listTopics();
    const topicsToCreate = allTopics
      .filter((topic) => !existingTopics.includes(topic))
      .map((topic) => ({ topic, numPartitions: 3, replicationFactor: 1 }));

    if (topicsToCreate.length > 0) {
      try {
        await admin.createTopics({
          topics: topicsToCreate,
          waitForLeaders: true,
        });
        console.log(
          `[kafka-setup] Created ${topicsToCreate.length} Kafka topics`,
        );
      } catch (err: any) {
        console.log(`[kafka-setup] Failed to create topics (might exist already): ${err.message}`);
      }
    } else {
      console.log('[kafka-setup] All Kafka topics already exist');
    }
  } finally {
    await admin.disconnect();
  }
}
