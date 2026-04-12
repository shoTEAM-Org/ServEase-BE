import { Kafka } from 'kafkajs';
import { KAFKA_TOPICS } from '@app/common';

export async function ensureKafkaTopics(broker?: string): Promise<void> {
  const kafka = new Kafka({
    clientId: 'servease-topic-admin',
    brokers: [broker || process.env.KAFKA_BROKER || 'localhost:9092'],
  });

  const admin = kafka.admin();
  await admin.connect();

  const existingTopics = await admin.listTopics();
  const topicsToCreate = Object.values(KAFKA_TOPICS)
    .filter((topic) => !existingTopics.includes(topic))
    .map((topic) => ({ topic, numPartitions: 3, replicationFactor: 1 }));

  if (topicsToCreate.length > 0) {
    await admin.createTopics({ topics: topicsToCreate });
    console.log('Created Kafka topics:', topicsToCreate.map((t) => t.topic).join(', '));
  } else {
    console.log('All Kafka topics already exist');
  }

  await admin.disconnect();
}
