import { Producer as KafkaProducer, ProduceAcks, stringSerializers } from '@platformatic/kafka';
import { Config } from './config.ts';

export const Producer = new KafkaProducer({
  clientId: 'pgwal-bridge',
  bootstrapBrokers: Config.kafka.brokers,
  serializers: stringSerializers,
  acks: ProduceAcks.ALL,
  sasl: {
    mechanism: 'PLAIN',
    username: Config.kafka.username,
    password: Config.kafka.password,
  },
});
