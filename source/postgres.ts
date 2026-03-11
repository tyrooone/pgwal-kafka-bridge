import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { Config } from './config.ts';

export const Replication = new LogicalReplicationService({
  connectionString: Config.postgres.url,
}, {
  acknowledge: {
    auto: true,
    timeoutSeconds: 10,
  },
});

export const Plugin = new PgoutputPlugin({
  protoVersion: 1,
  publicationNames: [
    Config.postgres.pubName,
  ],
});
