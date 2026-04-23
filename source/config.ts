import 'dotenv/config';
import env from 'env-var';
import type { TableConfig } from './types.ts';

export const Config = {
  port: env.get('PORT').default(5430).asPortNumber(),
  postgres: {
    url: env.get('PG_URL').required().asUrlString(),
    reject: env.get('PG_REJECT').asBoolStrict(),
    timeout: env.get('PG_TIMEOUT').default('4000').asIntPositive(),
    slotName: env.get('PG_SLOT_NAME').required().asString(),
    pubName: env.get('PG_PUB_NAME').required().asString(),
  },
  kafka: {
    brokers: env.get('KAFKA_BROKERS').required().asArray(','),
    username: env.get('KAFKA_USERNAME').required().asString(),
    password: env.get('KAFKA_PASSWORD').required().asString(),
    partitions: env.get('KAFKA_PARTITIONS_COUNT').asIntPositive(),
    timeout: env.get('KAFKA_TIMEOUT').default('1000').asIntPositive(),
    batch: {
      size: env.get('KAFKA_BATCH_SIZE').default('100').asIntPositive(),
      time: env.get('KAFKA_BATCH_TIME').default('100').asIntPositive(),
    },
    retries: {
      attempts: env.get('KAFKA_RETRIES_ATTEMPTS').default('1000').asIntPositive(),
      timeout: env.get('KAFKA_RETRIES_TIMEOUT').default('4000').asIntPositive(),
    },
  },
  tables: env.get('BRIDGE_TABLES').required().asJsonArray() as TableConfig[],
};
