export const TOPICS = {
  BOOKINGS:  'servease.bookings',
  PAYMENTS:  'servease.payments',
  PROVIDERS: 'servease.providers',
  USERS:     'servease.users',
  SUPPORT:   'servease.support',
} as const;

export type TopicKey = keyof typeof TOPICS;
export type TopicValue = (typeof TOPICS)[TopicKey];

export const KAFKA_TOPICS = TOPICS;
