import type { z } from "zod";
import { awaitingName } from "../discovery/definition-name";
import type { DomainEvent } from "./define-event";

/**
 * A listener definition: which event it reacts to, and how it runs. The
 * name is its file's path under `server/listeners/`.
 */
export interface Listener {
  readonly name: string;
  readonly event: string;
  version: number;
  upcasters: number[];
  sync: boolean;
  run: (payload: unknown) => Promise<void>;
  runQueued: (data: unknown) => Promise<void>;
}

/**
 * Defines a listener: work that reacts to a {@link defineEvent} event.
 *
 * `defineListener` is auto-imported. One listener per file, under
 * `server/listeners/`; the file is discovered, so nothing registers it,
 * and its path names it (`server/listeners/post/notify-subscribers.listener.ts`
 * is `"post.notify-subscribers"`) for `nuxvel events`, the test fixture
 * and the queue job a queued run waits in, `listener:<name>`;
 * {@link renamed} at the old path keeps runs queued under the old name
 * working.
 *
 * A listener runs queued by default: the emitting transaction commits
 * first, then `nuxvel queue:work` runs the handler. Pass `sync: true` to
 * run it inline instead, inside the emitting action's transaction — its
 * writes then commit or roll back with the action's, and a throw fails
 * the action.
 *
 * The handler gets the event schema's parsed output: the payload is
 * parsed once, from the raw value {@link DomainEvent.emit} was given, and a queued
 * payload written under an older event version is upcast first — see
 * {@link defineEvent}.
 *
 * @param config.event The event to react to, imported from
 * `server/events/`.
 * @param config.sync Run inline in the emitting transaction instead of
 * on the queue. Defaults to `false`.
 * @param config.handler The work itself.
 *
 * @example
 * ```ts
 * export const postNotifySubscribersListener = defineListener({
 *   event: postPublishedEvent,
 *   async handler({ postId }) {
 *     await notifySubscribers(postId);
 *   },
 * });
 * ```
 */
export function defineListener<Schema extends z.ZodType>(config: {
  event: DomainEvent<Schema>;
  sync?: boolean;
  handler: (payload: z.output<Schema>) => void | Promise<void>;
}): Listener {
  return awaitingName(
    {
      name: "",
      get event() {
        return config.event.name;
      },
      version: config.event.version,
      upcasters: config.event.upcasters,
      sync: config.sync === true,
      async run(payload: unknown) {
        await config.handler(await config.event.parse(payload));
      },
      async runQueued(data: unknown) {
        await config.handler(await config.event.parseQueued(data));
      },
    },
    "listener",
  );
}
