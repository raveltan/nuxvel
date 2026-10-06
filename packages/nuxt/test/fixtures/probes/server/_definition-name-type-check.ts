import { z } from "zod";

type IsAny<T> = 0 extends 1 & T ? true : false;

type Includes<Union, Names extends string> = IsAny<Union> extends true
  ? never
  : string extends Union
    ? never
    : [Names] extends [Union]
      ? true
      : never;

export const scheduleNamesArePaths: Includes<ScheduleName, "_probe.tick" | "nuxvel.prune-outbox"> = true;
export const webhookNamesArePaths: Includes<WebhookName, "_probe"> = true;
export const nestedJobIsDotted: Includes<JobName, "post.notify-followers" | "_probe.record"> = true;
export const flagNamesKeepKebabCase: Includes<FlagName, "probe-rollout"> = true;
export const channelNamesArePaths: Includes<ChannelName, "_probe-public"> = true;

export async function oldNamesNoLongerCompile() {
  // @ts-expect-error the job moved to server/jobs/_probe/record.ts, so it is _probe.record
  await $jobs.probe.record.dispatch({ name: "old" });
  // @ts-expect-error the flag in server/flags/probe-rollout.flag.ts is probe-rollout
  await flag("probeRollout");
  // @ts-expect-error the backfill in server/database/backfills/_probe-names.ts is _probe-names
  await runBackfill("probe-names");
}

export const jobsTakeNoName = defineJob({
  // @ts-expect-error a job is named after its file, not by an option
  name: "post.notify-followers",
  handler: () => {},
});

export const schedulesTakeNoName = defineSchedule({
  // @ts-expect-error a schedule is named after its file, not by an option
  name: "nightly",
  at: { hour: 3 },
  handler: () => {},
});

export const eventsTakeNoName = defineEvent({
  // @ts-expect-error an event is named after its file, not by an option
  name: "post.published",
  payload: z.object({}),
});

// @ts-expect-error a flag is named after its file, not by an option
export const flagsTakeNoName = defineFlag({ name: "newCheckout", default: false });

export const webhooksTakeNoName = defineWebhook({
  // @ts-expect-error a webhook is named after its file, not by an option
  name: "billing",
  verify: () => false,
  eventId: () => "",
  handler: () => {},
});
