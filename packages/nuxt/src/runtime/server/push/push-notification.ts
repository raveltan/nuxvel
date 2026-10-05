import { z } from "zod";

export const pushNotificationSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
  url: z.string().optional(),
  icon: z.string().optional(),
});

/**
 * What {@link sendPush} shows on the user's devices: a title and a body,
 * the page a click opens (`url`, default `/`) and the notification's
 * `icon`.
 */
export type PushNotification = z.infer<typeof pushNotificationSchema>;
