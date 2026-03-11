import 'dotenv/config';
import env from 'env-var';
import type { TableConfig } from './types.ts';

export const Config = {
  port: env.get('PORT').default(5430).asPortNumber(),
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
