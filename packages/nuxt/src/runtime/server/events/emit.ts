import { queueAfterCommit } from "../jobs/outbox/queue-after-commit";
import { publishObserved } from "../observe/channels";
import type { DomainEvent } from "./define-event";
import { listenerJobName } from "./queue-name";
import { listenersFor } from "./registry";

export async function emit(event: DomainEvent, payload: unknown): Promise<void> {
  const parsed = await event.parse(payload);

  publishObserved("event:emit", { name: event.name, payload: parsed });

  for (const listener of listenersFor(event.name)) {
    if (!listener.sync) {
      await queueAfterCommit(listenerJobName(listener.name), listener.version, payload);
      continue;
    }

    await listener.run(payload);
    publishObserved("listener:run", { name: listener.name, event: event.name });
  }
}
