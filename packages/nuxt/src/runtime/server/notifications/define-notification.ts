import type { z } from "zod";
import { awaitingName } from "../discovery/definition-name";
import type { MailInput, MailName } from "../mail/registry";
import type { PushNotification } from "../push/push-notification";
import type { NotificationMessage } from "./notification-message";

/** A way a notification reaches its user: a row in `notifications`, a mail, or a web push. */
export type NotificationChannel = "database" | "mail" | "push";

/**
 * What a notification's `toMail` returns: a {@link defineMail} name and
 * that mail's input without `to`, which is the user's email.
 */
export type NotificationMail = {
  [Name in MailName]: { mail: Name; data: Omit<MailInput<Name>, "to"> };
}[MailName];

type Builders<Data, Via extends NotificationChannel> = ("database" extends Via
  ? { toDatabase: (data: Data) => NotificationMessage }
  : { toDatabase?: never }) &
  ("mail" extends Via ? { toMail: (data: Data) => NotificationMail } : { toMail?: never }) &
  ("push" extends Via ? { toPush: (data: Data) => PushNotification } : { toPush?: never });

/**
 * A notification definition: its name, the data it takes and how each
 * channel renders it. The name is its file's path under
 * `server/notifications/`.
 */
export interface Notification<Name extends string = string, Schema extends z.ZodType = z.ZodType> {
  readonly name: Name;
  schema: Schema;
  via: readonly NotificationChannel[];
  toDatabase?(data: z.output<Schema>): NotificationMessage;
  toMail?(data: z.output<Schema>): NotificationMail;
  toPush?(data: z.output<Schema>): PushNotification;
  /**
   * Sends this notification with `data` to one user or to several,
   * through the channels its `via` lists.
   *
   * Validates `data` against the schema, throwing a
   * `ValidationFailedError`. The `database` channel inserts one
   * `notifications` row per user now, inside the surrounding transaction,
   * so it commits or rolls back with it. The open bells refresh, the
   * `mail` channel queues the mail and the `push` channel queues the
   * push once the transaction commits, so a rollback notifies nobody.
   * Outside a transaction all of it happens now.
   *
   * @param userIds The ID of the user to notify, or a list of IDs.
   *
   * @example
   * ```ts
   * await $notifications.post.published.notify(post.authorId, { postId: post.id, title: post.title });
   * ```
   */
  notify(userIds: string | readonly string[], data: z.input<Schema>): Promise<void>;
}

/**
 * Defines a notification: one message to a user, sent through the
 * channels its `via` lists.
 *
 * `defineNotification` is auto-imported. One notification per file,
 * under `server/notifications/`; the file is discovered, so nothing
 * registers it, and its path is the notification's name
 * (`server/notifications/post/published.notification.ts` is `"post.published"`).
 * Send it with {@link Notification.notify} through the `$notifications`
 * namespace: `$notifications.post.published.notify(userId, data)`. Each channel in `via` needs its builder,
 * and a builder for a channel `via` leaves out fails to compile.
 *
 * @param config.schema Zod schema of the data {@link Notification.notify} takes.
 * @param config.via The channels it goes through: `"database"`, `"mail"`,
 * `"push"`.
 * @param config.toDatabase Builds the `notifications` row's
 * {@link NotificationMessage}, which the bell shows.
 * @param config.toMail Picks the {@link defineMail} mail and its input;
 * the user's email is its `to`.
 * @param config.toPush Builds the {@link PushNotification} that
 * {@link sendPush} sends to the user's subscribed devices. Needs
 * `nuxvel.pwa`.
 *
 * @example
 * ```ts
 * // server/notifications/post/published.notification.ts
 * export const postPublishedNotification = defineNotification({
 *   schema: z.object({ postId: z.number(), title: z.string() }),
 *   via: ["database", "mail"],
 *   toDatabase: ({ postId, title }) => ({ title: "Your post is live", body: title, url: `/posts/${postId}` }),
 *   toMail: ({ title }) => ({ mail: "post.published", data: { title } }),
 * });
 * ```
 */
export function defineNotification<Schema extends z.ZodType, const Via extends readonly NotificationChannel[]>(
  config: { schema: Schema; via: Via } & Builders<z.output<Schema>, Via[number]>,
): Notification<string, Schema> {
  const notification: Notification<string, Schema> = awaitingName(
    {
      name: "",
      schema: config.schema,
      via: config.via,
      toDatabase: config.toDatabase,
      toMail: config.toMail,
      toPush: config.toPush,
      async notify(userIds: string | readonly string[], data: z.input<Schema>) {
        // a static import cycles through the #nuxvel/notifications registry, which holds this notification
        const { notify } = await import("./notify");

        await notify(userIds, notification, data);
      },
    },
    "notification",
  );

  return notification;
}
