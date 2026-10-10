// Domain events raised by services (task.updated, member.removed, …). They are queued during a
// transaction and handed to listeners only after COMMIT (see lib/tx.ts). The SSE hub subscribes
// in Phase 6; until then nothing listens.

export interface AppEvent {
  type: string;
  /** Project-scoped events go to that project's current members (+ admins). */
  projectId?: string;
  /** User-scoped events go to these users only. */
  userIds?: string[];
  actorId?: string;
  data: unknown;
}

type Listener = (event: AppEvent) => void;
const listeners = new Set<Listener>();

/** Returns an unsubscribe function. */
export function onCommittedEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishCommitted(events: readonly AppEvent[]): void {
  for (const event of events) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A failing listener (e.g. a closed stream) must never break the request that wrote the data
      }
    }
  }
}
