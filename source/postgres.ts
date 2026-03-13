import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { Config } from './config.ts';

export const Replication = new LogicalReplicationService({
  connectionString: Config.postgres.url,
  ssl: {
    rejectUnauthorized: Config.postgres.reject,
  },
}, {
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
