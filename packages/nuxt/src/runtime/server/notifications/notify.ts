import type { z } from "zod";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { onCommit } from "../database/transaction";
import { ValidationFailedError } from "../errors/taxonomy";
import { publishObserved } from "../observe/channels";
import { sendPush } from "../push/send-push";
import { dispatchAfterCommit } from "../utils/dispatch-after-commit";
import { announceChange } from "./announce-change";
import type { Notification } from "./define-notification";
import { NOTIFICATION_JOB_NAME } from "./jobs/notification-job-name";
import { type NotificationData, type NotificationName, findNotification } from "./registry";

/**
 * Sends a notification, by its name or its definition, to one user or
 * to several.
 *
 * Auto-imported on the server. Validates `data` against the
 * notification's {@link defineNotification} schema, throwing the same
 * {@link ValidationFailedError} an action throws. The `database`
 * channel inserts one `notifications` row per user now, inside the
 * ambient transaction, and after commit tells each user's open
 * `useNotifications()` to refresh. The `mail` channel dispatches the built-in
 * `nuxvel.notification` job after commit, which sends the mail to each
 * user's email with {@link sendMail}, in the `locale` of the user. The `push` channel calls
 * {@link sendPush}, which dispatches the `nuxvel.push` job after commit;
 * a user with no subscribed device gets nothing. So a rolled-back
 * transaction notifies nobody.
 *
 * The second argument is a {@link NotificationName} or the notification's
 * definition (`$notifications.welcome` or an import), and `data` that
 * notification's data, so a misspelled name or wrong data fails to
 * compile. Throws when no notification has this name.
 *
 * @param userIds The ID of the user to notify, or a list of IDs.
 *
 * @example
 * ```ts
 * await notify(post.authorId, "post.published", { postId: post.id, title: post.title });
 * await notify(post.authorId, $notifications.post.published, { postId: post.id, title: post.title });
 * ```
 */
export async function notify<Name extends NotificationName>(
  userIds: string | readonly string[],
  name: Name,
  data: NotificationData<Name>,
): Promise<void>;
export async function notify<Schema extends z.ZodType>(
  userIds: string | readonly string[],
  notification: Notification<string, Schema>,
  data: z.input<Schema>,
): Promise<void>;
export async function notify(
  userIds: string | readonly string[],
  nameOrNotification: string | Notification,
  data: unknown,
): Promise<void> {
  const name = notificationName(nameOrNotification);
  const notification = findNotification(name);

  if (!notification) throw new Error(`No notification is named "${name}"`);

  const result = await notification.schema.safeParseAsync(data);

  if (!result.success) throw new ValidationFailedError(result.error);

  const recipients = typeof userIds === "string" ? [userIds] : [...userIds];

  if (recipients.length === 0) return;

  const message = notification.toDatabase?.(result.data);

  if (message) {
    await useDb()
      .insert(schemaTable("notifications"))
      .values(recipients.map((userId) => ({ userId, name, data: message })));
    await onCommit(() => announceChange(recipients));
  }

  await onCommit(() => {
    for (const userId of recipients) publishObserved("notification:send", { userId, name, message });
  });

  const mail = notification.toMail?.(result.data);

  if (mail) await dispatchAfterCommit(NOTIFICATION_JOB_NAME, { userIds: recipients, mail });

  const push = notification.toPush?.(result.data);

  if (push) await sendPush(recipients, push);
}

function notificationName(nameOrNotification: string | Notification) {
  return typeof nameOrNotification === "string" ? nameOrNotification : nameOrNotification.name;
}
