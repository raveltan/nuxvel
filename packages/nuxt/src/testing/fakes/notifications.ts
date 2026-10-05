import type { Notification } from "../../runtime/server/notifications/define-notification";
import type { NotificationMessage } from "../../runtime/server/notifications/notification-message";
import type { NotificationName } from "../../runtime/server/notifications/registry";
import type { SentNotification } from "../../runtime/server/observe/channels";
import { recordedEffects } from "../recorded";
import { expectNotRecorded, expectRecorded, includes } from "./records";

function notificationName(nameOrNotification: string | Notification) {
  return typeof nameOrNotification === "string" ? nameOrNotification : nameOrNotification.name;
}

/**
 * Asserts that a notification, by its name or its definition, reached
 * the `user` during the test, with a `database` message whose fields include
 * `match`.
 *
 * A {@link notify} call is recorded per user once its transaction
 * commits, so a rolled-back one records nothing. The mail it sends goes
 * through the `nuxvel.notification` job, which no functional test runs;
 * {@link runJob} runs it.
 *
 * @param name A {@link NotificationName}, so a name no notification
 * defines fails to compile, or the notification's definition or its stub
 * from `#nuxvel/test-namespaces`.
 * @param match Fields of the {@link NotificationMessage} its
 * `toDatabase` built, such as `title`; defaults to matching any.
 * @param options.times How many matching notifications there must be, 1 or more.
 * @returns The latest matching notification.
 *
 * @example
 * ```ts
 * const { message } = await expectNotified(author, "post.published", { title: "Your post is live" });
 * await expectNotified(author, $notifications.post.published);
 * ```
 */
export async function expectNotified(
  user: { id: string },
  name: NotificationName | Notification,
  match?: Partial<NotificationMessage>,
  options: { times?: number } = {},
): Promise<SentNotification> {
  const notification = notificationName(name);
  const { notified } = await recordedEffects();
  const matchesMessage = includes(match);

  return expectRecorded(
    "expectNotified",
    `notification "${notification}" for ${user.id} with ${JSON.stringify(match ?? {})}`,
    notified,
    (sent) => sent.userId === user.id && sent.name === notification && (!match || matchesMessage(sent.message)),
    options.times,
  );
}

/**
 * Asserts that a notification, by its name or its definition, never
 * reached the `user` during the test.
 *
 * @example
 * ```ts
 * await expectNotNotified(reader, "post.published");
 * await expectNotNotified(reader, $notifications.post.published);
 * ```
 */
export async function expectNotNotified(user: { id: string }, nameOrNotification: NotificationName | Notification) {
  const name = notificationName(nameOrNotification);
  const { notified } = await recordedEffects();

  expectNotRecorded(
    "expectNotNotified",
    `notification "${name}" for ${user.id}`,
    notified,
    (sent) => sent.userId === user.id && sent.name === name,
  );
}
