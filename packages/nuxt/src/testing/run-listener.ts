import type listeners from "#nuxvel/listeners";
import type { Defined } from "../runtime/server/discovery/aliases";
import type { Listener } from "../runtime/server/events/define-listener";
import { callApp } from "./settled";

/** The name of every listener defined under `server/listeners/`: what {@link runListener} takes. */
export type ListenerName = Defined<(typeof listeners)[number]>["name"];

/**
 * Runs a {@link defineListener} handler, by its name or its definition,
 * in the app under test, here and now, with `payload` as its event's
 * payload.
 *
 * Use it for a queued listener: {@link emit} only queues one, and
 * no `nuxvel queue:work` process runs it in a test. The payload goes
 * through the same parse as a queued run, so an invalid one rejects
 * with a `BAD_REQUEST` validation error; a handler that throws rejects
 * with its error.
 *
 * @param name A {@link ListenerName}, or the listener's definition or its
 * stub from `#nuxvel/test-namespaces`; a name no listener defines fails
 * to compile.
 * @param payload The listener's event payload, before the event's
 * schema parses it.
 *
 * @example
 * ```ts
 * await runListener("post.notify-subscribers", { postId: post.id });
 * await runListener($listeners.post.notifySubscribers, { postId: post.id });
 * await expectRow(notificationsTable, { postId: post.id });
 * ```
 */
export async function runListener(nameOrListener: ListenerName | Listener, payload: unknown): Promise<void> {
  const name = typeof nameOrListener === "string" ? nameOrListener : nameOrListener.name;

  await callApp("run-listener", { name, payload });
}
