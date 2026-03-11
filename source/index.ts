import { Config } from './config.ts';
import { Producer } from './kafka.ts';
import { Logger } from './logger.ts';
import { Plugin, Replication } from './postgres.ts';
import { Server } from './server.ts';
import type { TableTarget } from './types.ts';

/**
 * Graceful shutdown
 */
const onShutdown = () => {
  Server.close();
  Replication.stop();
  Producer.close().then(() => process.exit(0));
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

  const messages = matchedTargets.map((target) => ({
    topic: target.topic,
    key: String(row[target.partitionKey]),
    value: payload,
  }));

  Logger.info({
    operation: msg.tag,
    table: `${msg.relation.schema}.${msg.relation.name}`,
    topics: messages.map((m) => m.topic),
    keys: messages.map((m) => m.key),
  }, 'wal event');

  const result = await Producer.send({ messages });
  const offsets = result.offsets?.map((o) => ({ topic: o.topic, partition: o.partition, offset: String(o.offset) }))

  Logger.info({ partitions: offsets }, 'produced');
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
