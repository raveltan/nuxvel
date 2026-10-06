import { randomUUID } from "node:crypto";
import { ValidationFailedError } from "../errors/taxonomy";
import { dispatchJob } from "../jobs/dispatch-job";
import { PUSH_JOB_NAME } from "./jobs/push-job-name";
import { type PushNotification, pushNotificationSchema } from "./push-notification";

/**
 * Sends a web push notification to every device that the user, or each
 * of the users, subscribed with `usePush()`, once the surrounding
 * transaction commits.
 *
 * Auto-imported on the server when `nuxvel.pwa` is set. Validates
 * `notification`, throwing {@link ValidationFailedError}, then hands it to
 * {@link Job.dispatch} as a `nuxvel.push` job, so a rolled-back
 * transaction sends nothing. The job signs each delivery with the VAPID
 * keys from `NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY`,
 * `NUXT_PUSH_VAPID_PRIVATE_KEY` and `NUXT_PUSH_VAPID_SUBJECT`, deletes a
 * subscription whose push service answers 404 or 410, and fails for a
 * retry when another delivery fails. Each send carries one tag, so a
 * retried delivery replaces the notification instead of showing it twice.
 *
 * @param userIds The ID of the user to notify, or a list of them.
 * @param notification.title The notification's title.
 * @param notification.body Its text.
 * @param notification.url The page a click opens. Defaults to `/`.
 * @param notification.icon The URL of its icon.
 *
 * @example
 * ```ts
 * await sendPush(post.authorId, {
 *   title: "New comment",
 *   body: `${commenter.name} commented on "${post.title}"`,
 *   url: `/posts/${post.id}`,
 * });
 * ```
 */
export async function sendPush(userIds: string | string[], notification: PushNotification) {
  const result = pushNotificationSchema.safeParse(notification);

  if (!result.success) throw new ValidationFailedError(result.error);

  const recipients = [userIds].flat();

  if (recipients.length === 0) return;

  await dispatchJob(PUSH_JOB_NAME, {
    userIds: recipients,
    notification: { ...result.data, tag: randomUUID() },
  });
}
