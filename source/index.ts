import 'dotenv/config';

import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { Producer, ProduceAcks, stringSerializers } from '@platformatic/kafka';
import pino from 'pino';
import env from 'env-var';

import type { TableConfig } from './types.js';

const logger = pino({ name: 'pgwal-kafka-bridge' });

const config = {
  postgres: {
    url: env.get('PG_URL').required().asUrlString(),
    slotName: env.get('PG_SLOT_NAME').required().asString(),
    pubName: env.get('PG_PUB_NAME').required().asString(),
  },
  kafka: {
    brokers: env.get('KAFKA_BROKERS').required().asArray(','),
    username: env.get('KAFKA_USERNAME').asString(),
    password: env.get('KAFKA_PASSWORD').asString(),
  },
  tables: env.get('BRIDGE_TABLES').required().asJsonArray() as TableConfig[],
};

const producer = new Producer({
  clientId: 'pgwal-bridge',
  bootstrapBrokers: config.kafka.brokers,
  serializers: stringSerializers,
  acks: ProduceAcks.ALL,
  sasl: {
    mechanism: 'PLAIN',
    username: config.kafka.username,
    password: config.kafka.password,
  },
});

const replication = new LogicalReplicationService({
  connectionString: config.postgres.url,
}, {
  acknowledge: {
    auto: true,
    timeoutSeconds: 10,
  },
});

const plugin = new PgoutputPlugin({
  protoVersion: 1,
  publicationNames: [
    config.postgres.pubName,
  ],
});

const shutdown = () => {
  replication.stop();
  producer.close().then(() => process.exit(0));
}

replication.on('data', async (_, msg) => {
  if (msg.tag !== 'insert' && msg.tag !== 'update' && msg.tag !== 'delete') return;

  const tableConfig = config.tables.find((t) => t.schema === msg.relation.schema && t.table === msg.relation.name);
  if (!tableConfig) return;

  const row = msg.new ?? msg.old;

  const payload = JSON.stringify({
    schema: msg.relation.schema,
    table: msg.relation.name,
    operation: msg.tag,
    row,
  });

  const messages = tableConfig.targets.map((target) => ({
    topic: target.topic,
    key: String(row[target.partitionKey]),
    value: payload,
  }));

  logger.info({
    operation: msg.tag,
    table: `${msg.relation.schema}.${msg.relation.name}`,
    topics: messages.map((m) => m.topic),
    keys: messages.map((m) => m.key),
  }, 'wal event');

  const result = await producer.send({ messages });
  const offsets = result.offsets?.map((o) => ({ topic: o.topic, partition: o.partition, offset: String(o.offset) }))

  logger.info({ partitions: offsets }, 'produced');
});

replication.on('error', (err) => {
  logger.error({ err }, 'replication error');
});

logger.info({ tables: config.tables.map((t) => t.table) }, 'watching tables');

replication.subscribe(plugin, config.postgres.slotName).catch((err) => {
  logger.fatal({ err }, 'subscription failed');
  process.exit(1);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
