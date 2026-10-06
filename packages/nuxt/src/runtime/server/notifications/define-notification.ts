import type { z } from "zod";
import { awaitingName } from "../discovery/definition-name";
import type { Mail, MailSchema } from "../mail/define-mail";
import type { PushNotification } from "../push/push-notification";
import type { NotificationMessage } from "./notification-message";

/** A way a notification reaches its user: a row in `notifications`, a mail, or a web push. */
export type NotificationChannel = "database" | "mail" | "push";

/**
 * What a notification's `toMail` returns: a {@link defineMail} mail,
 * such as `$mails.welcome`, and that mail's input without `to`, which is
 * the user's email.
 */
export interface NotificationMail<Schema extends MailSchema = MailSchema> {
  mail: Mail<string, Schema>;
  input: Omit<z.input<Schema>, "to">;
}

type Builders<Data, Via extends NotificationChannel, Schema extends MailSchema> = { message?: never; mail?: never } & ("database" extends Via
  ? { toDatabase: (data: Data) => NotificationMessage }
  : { toDatabase?: never }) &
  ("mail" extends Via ? { toMail: (data: Data) => NotificationMail<Schema> } : { toMail?: never }) &
  ("push" extends Via ? { toPush: (data: Data) => PushNotification } : { toPush?: never });

type FedByMessage<Schema extends MailSchema> = NotificationMessage extends Omit<z.input<Schema>, "to">
  ? unknown
  : { "the mail input must accept title, body, url and icon": never };

type MessageMail<Data, Schema extends MailSchema> =
  | { mail: Mail<string, Schema> & FedByMessage<Schema>; toMail?: never }
  | { toMail: (data: Data) => NotificationMail<Schema>; mail?: never };

type MessageBuilders<Data, Via extends NotificationChannel, Schema extends MailSchema> = {
  message: (data: Data) => NotificationMessage;
} & ("database" extends Via ? { toDatabase?: (data: Data) => NotificationMessage } : { toDatabase?: never }) &
  ("mail" extends Via ? MessageMail<Data, Schema> : { mail?: never; toMail?: never }) &
  ("push" extends Via ? { toPush?: (data: Data) => PushNotification } : { toPush?: never });

/**
 * A notification definition: its name, the data it takes and how each
 * channel renders it. The name is its file's path under
 * `server/notifications/`.
 */
export interface Notification<Name extends string = string, Schema extends z.ZodType = z.ZodType> {
  readonly name: Name;
  input: Schema;
  via: readonly NotificationChannel[];
  toDatabase?(data: z.output<Schema>): NotificationMessage;
  toMail?(data: z.output<Schema>): NotificationMail;
  toPush?(data: z.output<Schema>): PushNotification;
  /**
   * Sends this notification with `data` to one user or to several,
   * through the channels its `via` lists.
   *
   * Validates `data` against `input`, throwing a
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
 * namespace: `$notifications.post.published.notify(userId, data)`.
 *
 * `message` builds one {@link NotificationMessage} for every channel:
 * the `notifications` row, the push, and the input of `mail`. `toDatabase`,
 * `toPush` and `toMail` replace it for their channel. Without `message`,
 * each channel in `via` needs its builder. A builder for a channel `via`
 * leaves out fails to compile.
 *
 * @param config.input Zod schema of the data {@link Notification.notify} takes.
 * @param config.via The channels it goes through: `"database"`, `"mail"`,
 * `"push"`.
 * @param config.message Builds the title, body, `url` and `icon` that
 * every channel sends.
 * @param config.mail The {@link defineMail} mail, as its `$mails`
 * definition, that the `mail` channel sends with the message as its
 * input. Its input must accept a {@link NotificationMessage}.
 * @param config.toDatabase Builds the `notifications` row's
 * {@link NotificationMessage}, which the bell shows, in place of `message`.
 * @param config.toMail Picks the mail, as its `$mails` definition, and
 * its input without `to`, in place of `mail`; the user's email is its `to`.
 * @param config.toPush Builds the {@link PushNotification} that
 * {@link sendPush} sends to the user's subscribed devices, in place of
 * `message`. Needs `nuxvel.pwa`.
 *
 * @example
 * ```ts
 * // server/notifications/post/published.notification.ts
 * export const postPublishedNotification = defineNotification({
 *   input: z.object({ postId: z.number(), title: z.string() }),
 *   via: ["database", "mail", "push"],
 *   message: ({ postId, title }) => ({ title: "Your post is live", body: title, url: `/posts/${postId}` }),
 *   mail: $mails.notification,
 * });
 * ```
 */
export function defineNotification<
  Schema extends z.ZodType,
  const Via extends readonly NotificationChannel[],
  NotifiedMailSchema extends MailSchema = MailSchema,
>(
  config: { input: Schema; via: Via } & (
    | Builders<z.output<Schema>, Via[number], NotifiedMailSchema>
    | MessageBuilders<z.output<Schema>, Via[number], NotifiedMailSchema>
  ),
): Notification<string, Schema> {
  const via: readonly NotificationChannel[] = config.via;
  const { message, mail } = config;
  const notification: Notification<string, Schema> = awaitingName(
    {
      name: "",
      input: config.input,
      via: config.via,
      toDatabase: config.toDatabase ?? (via.includes("database") ? message : undefined),
      toMail: config.toMail ?? (via.includes("mail") && message && mail ? (data) => ({ mail, input: message(data) }) : undefined),
      toPush: config.toPush ?? (via.includes("push") ? message : undefined),
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
