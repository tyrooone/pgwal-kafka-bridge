import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { Config } from './config.ts';
import type { ClientConfig } from 'pg';

export const PostgresConfig: ClientConfig = {
  connectionString: Config.postgres.url,
}
if (typeof Config.postgres.reject === 'boolean') {
  PostgresConfig.ssl = {
    rejectUnauthorized: Config.postgres.reject,
  }
}

export const Replication = new LogicalReplicationService(PostgresConfig, {
  acknowledge: {
    auto: true,
    timeoutSeconds: 10,
  },
  flowControl: {
    enabled: true,
  },
});

export const Plugin = new PgoutputPlugin({
  protoVersion: 1,
  publicationNames: [
    Config.postgres.pubName,
  ],
});
