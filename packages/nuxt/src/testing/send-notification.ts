import type { z } from "zod";
import type { Notification } from "../runtime/server/notifications/define-notification";
import type { NotificationData, NotificationName } from "../runtime/server/notifications/registry";
import { callApp } from "./settled";

/**
 * Sends a {@link defineNotification} notification, by its name or its
 * definition, in the app under test, inside a transaction, as an action's {@link notify}
 * would.
 *
 * The `database` rows are written and the send is recorded once it
 * resolves, so {@link expectNotified} and {@link expectRow} see them. The
 * `mail` channel's `nuxvel.notification` job is dispatched to the queue
 * fake, not run. `data` is parsed by the notification's schema,
 * rejecting with a `BAD_REQUEST` validation error.
 *
 * @param users The user to notify, or a list of users.
 * @param name A {@link NotificationName}, or the notification's definition
 * or its stub from `#nuxvel/test-namespaces`; a name no notification
 * defines fails to compile.
 * @param data The notification's data, before its schema parses it.
 *
 * @example
 * ```ts
 * import { $notifications } from "#nuxvel/test-namespaces";
 *
 * await sendNotification(author, $notifications.post.published, { postId: post.id, title: post.title });
 * await expectNotified(author, "post.published", { title: "Your post is live" });
 * ```
 */
export async function sendNotification<Name extends NotificationName>(
  users: { id: string } | readonly { id: string }[],
  name: Name,
  data: NotificationData<Name>,
): Promise<void>;
export async function sendNotification<Schema extends z.ZodType>(
  users: { id: string } | readonly { id: string }[],
  notification: Notification<string, Schema>,
  data: z.input<Schema>,
): Promise<void>;
export async function sendNotification(
  users: { id: string } | readonly { id: string }[],
  nameOrNotification: string | Notification,
  data: unknown,
): Promise<void> {
  const name = typeof nameOrNotification === "string" ? nameOrNotification : nameOrNotification.name;

  await callApp("notify", { userIds: (Array.isArray(users) ? users : [users]).map(({ id }) => id), name, data });
}
