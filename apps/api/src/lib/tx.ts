import { db, type Tx } from '../db/client';
import { publishCommitted, type AppEvent } from './events';

export type Emit = (event: AppEvent) => void;

/**
 * Runs `work` in one DB transaction (the change + its activity log + notifications).
 * Events emitted inside are published only after COMMIT; if anything throws, the transaction
 * rolls back and the queued events are discarded, so clients never see a change that didn't
 * happen (DATA_MODEL R2).
 */
export async function withTransaction<T>(work: (tx: Tx, emit: Emit) => Promise<T>): Promise<T> {
  const events: AppEvent[] = [];
  const emit: Emit = (event) => {
    events.push(event);
  };
  const result = await db.transaction((tx) => work(tx, emit));
  publishCommitted(events);
  return result;
}
