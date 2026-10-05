import { z } from "zod";
import type { PushNotification } from "../../runtime/server/push/push-notification";
import type { DeliveredPush, RecordedJob } from "../../runtime/server/testing/recorders";
import { recordedEffects } from "../recorded";
import { callApp } from "../settled";
import { expectNotRecorded, expectRecorded, includes } from "./records";

const pushPayload = z.object({ userIds: z.array(z.string()).optional(), notification: z.unknown() });

function pushTo(userId: string, matchesNotification: (notification: unknown) => boolean) {
  return ({ name, payload }: RecordedJob) => {
    if (name !== "nuxvel.push") return false;

    const { userIds, notification } = pushPayload.parse(payload);

    return !!userIds?.includes(userId) && matchesNotification(notification);
  };
}

/**
 * Asserts that {@link sendPush} notified the `user` during the
 * test, with a notification whose fields include `match`.
 *
 * A send is recorded once its transaction commits, as its `nuxvel.push`
 * job is dispatched, so a rolled-back one records nothing. Nothing is
 * delivered until a test runs that job with `runJob()`; see
 * {@link fakePush}.
 *
 * @param match Notification fields the send must carry. Defaults to
 * matching any notification.
 * @param options.times How many matching sends there must be, 1 or more.
 * @returns The notification of the latest matching send.
 *
 * @example
 * ```ts
 * const { title } = await expectPushSent(author, { title: "New comment" });
 * ```
 */
export async function expectPushSent(
  user: { id: string },
  match: Partial<PushNotification> = {},
  options: { times?: number } = {},
): Promise<PushNotification> {
  const { dispatched } = await recordedEffects();
  const matchesNotification = includes(match);

  const job = expectRecorded(
    "expectPushSent",
    `a push for ${user.id} with ${JSON.stringify(match)}`,
    dispatched,
    pushTo(user.id, matchesNotification),
    options.times,
  );

  // recorded dispatch payloads are untyped; a nuxvel.push job always carries a notification
  return (job.payload as { notification: PushNotification }).notification;
}

/**
 * Asserts that {@link sendPush} did not notify the `user` with a
 * notification whose fields include `match`. Without `match`, any push to
 * the user fails it. The opposite of {@link expectPushSent}.
 *
 * @example
 * ```ts
 * await expectNoPushSent(reader);
 * ```
 */
export async function expectNoPushSent(user: { id: string }, match: Partial<PushNotification> = {}): Promise<void> {
  const { dispatched } = await recordedEffects();

  expectNotRecorded(
    "expectNoPushSent",
    `a push for ${user.id} with ${JSON.stringify(match)}`,
    dispatched,
    pushTo(user.id, includes(match)),
  );
}

/**
 * The push service that the `nuxvel.push` job delivers to in a test
 * build, in place of the browsers' push services.
 *
 * `delivered()` resolves to every push delivered during the test: its
 * subscription endpoint and the notification it carried. `gone(endpoint)`
 * makes that endpoint answer 410 from now on, as a push service does
 * for an expired subscription, so the job deletes it. Both reset after
 * every test.
 *
 * @example
 * ```ts
 * await runJob("nuxvel.push", { userIds: [author.id], notification: { title: "New comment", body: "Hi" } });
 * expect(await fakePush.delivered()).toContainEqual(
 *   expect.objectContaining({ notification: expect.objectContaining({ title: "New comment" }) }),
 * );
 * ```
 */
export const fakePush = {
  async delivered(): Promise<DeliveredPush[]> {
    return (await recordedEffects()).pushes;
  },

  async gone(endpoint: string): Promise<void> {
    await callApp("push-gone", { endpoint });
  },
};
