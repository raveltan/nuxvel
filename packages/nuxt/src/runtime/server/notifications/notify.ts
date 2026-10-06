import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { onCommit } from "../database/transaction";
import { ValidationFailedError } from "../errors/taxonomy";
import { publishObserved } from "../observe/channels";
import { sendPush } from "../push/send-push";
import { dispatchJob } from "../jobs/dispatch-job";
import { announceChange } from "./announce-change";
import type { Notification } from "./define-notification";
import { NOTIFICATION_JOB_NAME } from "./jobs/notification-job-name";

export async function notify(userIds: string | readonly string[], notification: Notification, data: unknown): Promise<void> {
  const { name } = notification;
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

  if (mail) await dispatchJob(NOTIFICATION_JOB_NAME, { userIds: recipients, mail });

  const push = notification.toPush?.(result.data);

  if (push) await sendPush(recipients, push);
}
