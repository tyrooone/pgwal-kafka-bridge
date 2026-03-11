import pino from 'pino';

export const Logger = pino({ name: 'pgwal-kafka-bridge' });
