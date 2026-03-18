import { Admin } from '@platformatic/kafka';
import { Client } from 'pg';
import { unique } from 'radash';
import { Config } from './config.ts';
import { Logger } from './logger.ts';
import { PostgresConfig } from './postgres.ts';
import type { TablePublication } from './types.ts';

/**
 * Run PostgreSQL migrations (publication, slot, replica identity)
 * and create Kafka topics based on configuration.
 */
export async function migrate() {
  const client = new Client(PostgresConfig);
  await client.connect();

  const schemaTables = Config.tables.map((t) => `"${t.schema}"."${t.table}"`)

  // Check if publication exists
  const pubExists = await client.query(`
    SELECT oid FROM pg_publication WHERE pubname = $1
  `, [
    Config.postgres.pubName,
  ]);

  // Publication does not exist — create it
  if (pubExists.rowCount === 0) {
    await client.query(`CREATE PUBLICATION ${Config.postgres.pubName} FOR TABLE ${schemaTables}`);
    Logger.info({ pubName: Config.postgres.pubName, tables: schemaTables }, 'publication created');
  }

  // Publication exists — check if table list differs
  if (pubExists.rowCount === 1) {
    const pubResult = await client.query<TablePublication>(`
      SELECT schemaname, tablename
      FROM pg_publication_tables
      WHERE pubname = $1
    `, [Config.postgres.pubName]);

    const existingTables = new Set(pubResult.rows.map((r) => `"${r.schemaname}"."${r.tablename}"`));
    const desiredTables = new Set(schemaTables);

    const toAdd = Array.from(desiredTables.difference(existingTables));
    const toDrop = Array.from(existingTables.difference(desiredTables));

    if (toAdd.length > 0) {
      const tables = toAdd.join(',');
      await client.query(`ALTER PUBLICATION "${Config.postgres.pubName}" ADD TABLE ${tables}`);
      Logger.info({ pub_name: Config.postgres.pubName, tables: toAdd }, 'publication tables added');

      // Set REPLICA IDENTITY FULL for each table
      for (const table of schemaTables) {
        await client.query(`ALTER TABLE ${table} REPLICA IDENTITY FULL`);
      }
      Logger.info({ tables: schemaTables }, 'replica identity set to full');
    }

    if (toDrop.length > 0) {
      const tables = toDrop.join(',');
      await client.query(`ALTER PUBLICATION "${Config.postgres.pubName}" DROP TABLE ${tables}`);
      Logger.info({ pub_name: Config.postgres.pubName, tables: toDrop }, 'publication tables dropped');
    }

    if (toAdd.length === 0 && toDrop.length === 0) {
      Logger.info({ pub_name: Config.postgres.pubName }, 'publication up to date');
    }
  }

  // Create replication slot if not exists
  const slotResult = await client.query(`SELECT 1 FROM pg_replication_slots WHERE slot_name = $1`, [
    Config.postgres.slotName,
  ]);
  if (slotResult.rowCount === 0) {
    await client.query(`SELECT pg_create_logical_replication_slot($1, 'pgoutput')`, [
      Config.postgres.slotName,
    ]);
    Logger.info({ slot_name: Config.postgres.slotName }, 'replication slot created');
  } else {
    Logger.info({ slot_name: Config.postgres.slotName }, 'replication slot exists');
  }

  // Create Kafka topics (outside transaction)
  const admin = new Admin({
    clientId: 'pgwal-bridge-admin',
    bootstrapBrokers: Config.kafka.brokers,
    sasl: {
      mechanism: 'PLAIN',
      username: Config.kafka.username,
      password: Config.kafka.password,
    },
  });

  try {
    const configTopics = unique(Config.tables.flatMap((t) => t.targets.map((tg) => tg.topic)));
    const brokerTopics = await admin.listTopics();

    const existingTopics = new Set(brokerTopics);
    const desiredTopics = new Set(configTopics)

    const toCreate = Array.from(desiredTopics.difference(existingTopics));
    if (toCreate.length > 0) {
      await admin.createTopics({
        topics: toCreate,
        partitions: Config.kafka.partitions,
        replicas: -1,
      });
      Logger.info({ topics: toCreate, partitions: Config.kafka.partitions }, 'kafka topics created');
    } else {
      Logger.info({ topics: brokerTopics }, 'kafka topics up to date');
    }
  } finally {
    await admin.close();
  }
}
