import { Config } from './config.ts';
import { Producer } from './kafka.ts';
import { Logger } from './logger.ts';
import { Plugin, Replication } from './postgres.ts';
import { Server } from './server.ts';
import type { TableTarget } from './types.ts';

/**
 * Kafka producer stream with built-in batching
 */
const producerStream = Producer.asStream({
  batchSize: Config.kafka.batch.size,
  batchTime: Config.kafka.batch.time,
  highWaterMark: Config.kafka.batch.size,
  reportMode: 'batch',
});

producerStream.on('error', (error) => {
  Logger.error({ error }, 'producer stream error');
});

producerStream.on('flush', ({ count, duration, result }) => {
  const uniqueTopics = new Set(result.offsets?.map((o: { topic: string }) => o.topic));
  const topicsList = Array.from(uniqueTopics)
  Logger.info({ count, duration, topics: topicsList }, 'batch flushed');
});

/**
 * Graceful shutdown
 */
const onShutdown = async () => {
  Server.close();
  await Replication.stop();
  await producerStream.close();
  Producer.close();
  process.exit(0);
}

/**
 * WAL event routing
 */
const isShouldSendToTarget = (params: {
  target: TableTarget,
  tag: string;
  old?: Record<string, unknown> | null;
  new?: Record<string, unknown>
}): boolean => {
  if (!params.target.match) return true;
  if (params.tag !== 'update') return true;

  const { or, and } = params.target.match;
  const changed = (col: string) => params.old?.[col] !== params.new?.[col];

  if (or?.length && or.some(changed)) return true;
  if (and?.length && and.every(changed)) return true;

  return !or?.length && !and?.length;
}

//
// Process replication event
//
Replication.on('data', async (_, msg) => {
  if (msg.tag !== 'insert' && msg.tag !== 'update' && msg.tag !== 'delete') return;

  const tableConfig = Config.tables.find((t) => t.schema === msg.relation.schema && t.table === msg.relation.name);
  if (!tableConfig) return;

  const row = msg.new ?? msg.old;

  const payload = JSON.stringify({
    schema: msg.relation.schema,
    table: msg.relation.name,
    operation: msg.tag,
    row,
  });

  const matchedTargets = tableConfig.targets.filter((t) => isShouldSendToTarget({
    target: t,
    tag: msg.tag,
    new: msg.new,
    old: msg.old,
  }));
  if (matchedTargets.length === 0) return;

  for (const target of matchedTargets) {
    const ok = producerStream.write({
      topic: target.topic,
      key: String(row[target.partitionKey]),
      value: payload,
    });

    if (!ok) {
      await new Promise<void>((resolve) => producerStream.once('drain', resolve));
    }
  }
});

//
// Processing replication error
//
Replication.on('error', (error) => {
  Logger.error({ error }, 'replication error');
});

//
// Start replication
//
Logger.info({ tables: Config.tables.map((t) => t.table) }, 'watching tables');

Replication.subscribe(Plugin, Config.postgres.slotName).catch((error) => {
  Logger.fatal({ error }, 'subscription failed');
  process.exit(1);
});

//
// Health server
//
Server.listen(Config.port, '0.0.0.0', () => {
  Logger.info({ port: Config.port }, 'health server listening');
});

//
// Process signals
//
process.on('SIGINT', onShutdown);
process.on('SIGTERM', onShutdown);
