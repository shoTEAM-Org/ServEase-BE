import { Kafka } from 'kafkajs';

let kafkaInstance: Kafka;

export function getKafkaClient(): Kafka {
  if (!kafkaInstance) {
    kafkaInstance = new Kafka({
      clientId: 'servease',
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      retry: {
        initialRetryTime: 300,
        retries: 10,
      },
    });
  }
  return kafkaInstance;
}
