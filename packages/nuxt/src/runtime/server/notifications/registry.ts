import type { z } from "zod";
import notifications from "#nuxvel/notifications";
import type { Notification } from "./define-notification";

type Discovered = (typeof notifications)[number];

/** The name of every notification defined under `server/notifications/`: what {@link notify} takes. */
export type NotificationName = Discovered["name"];

/** What the notification named `Name` is sent with: its `schema`'s input type. */
export type NotificationData<Name extends NotificationName> = z.input<
  Extract<Discovered, Notification<Name>>["schema"]
>;

function definitions(): readonly Notification[] {
  return notifications;
}

/** The discovered notification with this name, or `undefined` when no file defines one. */
export function findNotification(name: string): Notification | undefined {
  return definitions().find((notification) => notification.name === name);
}
