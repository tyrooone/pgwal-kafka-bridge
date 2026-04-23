import { Admin as KafkaAdmin, Producer as KafkaProducer, ProduceAcks, stringSerializers } from '@platformatic/kafka';
import { Config } from './config.ts';

export const Producer = new KafkaProducer({
  clientId: 'pgwal-bridge-producer',
  bootstrapBrokers: Config.kafka.brokers,
  serializers: stringSerializers,
  acks: ProduceAcks.ALL,
  sasl: {
    mechanism: 'PLAIN',
    username: Config.kafka.username,
    password: Config.kafka.password,
  },
  timeout: Config.kafka.timeout,
  connectTimeout: Config.kafka.timeout,
  requestTimeout: Config.kafka.timeout,
  retries: Config.kafka.retries.attempts,
  retryDelay: Config.kafka.retries.timeout,
});

export const Admin = new KafkaAdmin({
  clientId: 'pgwal-bridge-admin',
  bootstrapBrokers: Config.kafka.brokers,
  sasl: {
    mechanism: 'PLAIN',
    username: Config.kafka.username,
    password: Config.kafka.password,
  },
  timeout: Config.kafka.timeout,
  connectTimeout: Config.kafka.timeout,
  requestTimeout: Config.kafka.timeout,
  retries: Config.kafka.retries.attempts,
  retryDelay: Config.kafka.retries.timeout,
});
