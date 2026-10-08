import alwaysFailsJob from "#server/jobs/_probe/always-fails";
import recordJob from "#server/jobs/_probe/record";
import { namedExportJob } from "#server/jobs/_probe/named-export.job";
import { postNotifyFollowersJob } from "#server/jobs/post/notify-followers.job";
import { systemActor } from "@nuxvel/nuxt/server/actions";
import type { Actor } from "@nuxvel/nuxt/server/actions";
import { defineJob } from "@nuxvel/nuxt/server/queues";
import type { Job, JobInput, JobName } from "@nuxvel/nuxt/server/queues";
import { signedUrl } from "@nuxvel/nuxt/server/security";

type IsAny<T> = 0 extends 1 & T ? true : false;

export const jobNameIsTyped: IsAny<JobName> extends true
  ? never
  : string extends JobName
    ? never
    : "_probe.record" extends JobName
      ? true
      : never = true;

export const jobInputIsTyped: IsAny<JobInput<"_probe.record">> extends true
  ? never
  : JobInput<"_probe.record"> extends { name: string }
    ? true
    : never = true;

type NamespacedJob = typeof namedExportJob;

export const jobsNamespaceIsTyped: IsAny<NamespacedJob> extends true ? never : NamespacedJob extends Job ? true : never = true;
export const nestedJobIsReachable: Job = postNotifyFollowersJob;

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const jobDispatcherIsTyped = defineJob({
  handler: (_input, { dispatcher }) => {
    const dispatcherIsActor: Equals<typeof dispatcher, Actor | null> extends true ? true : never = true;

    return dispatcherIsActor;
  },
});

export async function dispatchesAsADispatcher() {
  await recordJob.dispatch({ name: "typed" }, { dispatcher: systemActor("typed") });
  await recordJob.dispatch({ name: "typed" }, { dispatcher: null });

  // @ts-expect-error a dispatcher is an actor
  await recordJob.dispatch({ name: "typed" }, { dispatcher: "system" });
}

type DispatchInput = Parameters<typeof recordJob.dispatch>[0];

export const dispatchInputIsTyped: IsAny<DispatchInput> extends true
  ? never
  : DispatchInput extends { name: string }
    ? true
    : never = true;

export async function dispatchesThroughTheDefinition() {
  await recordJob.dispatch({ name: "typed" });
  await recordJob.dispatch({ name: "typed" }, { delay: { seconds: 30 }, priority: 1, dispatcher: null });
  await alwaysFailsJob.dispatch();

  // @ts-expect-error the definition's input takes a string name
  await recordJob.dispatch({ name: 1 });
  // @ts-expect-error the definition's input needs its name
  await recordJob.dispatch();
}

export async function takesDurations() {
  defineJob({ timeout: { seconds: 30 }, backoff: { minutes: 1 }, handler: () => undefined });
  defineJob({ backoff: { type: "exponential", delay: 1000 }, handler: () => undefined });
  signedUrl("/invites/1", { expiresIn: { days: 7 } });

  // @ts-expect-error a timeout is a duration, not milliseconds
  defineJob({ timeout: 30_000, handler: () => undefined });
  // @ts-expect-error a delay is a duration, not milliseconds
  await recordJob.dispatch({ name: "typed" }, { delay: 60_000 });
  // @ts-expect-error an expiry is a duration, not seconds
  signedUrl("/invites/1", { expiresIn: 60 });
}

type JobBackoff = Exclude<Job["backoff"], number | undefined>;
type JobLimiter = NonNullable<Job["limiter"]>;

export const backoffIsTyped: IsAny<JobBackoff> extends true ? never : JobBackoff extends { type: "fixed" | "exponential" } ? true : never = true;
export const limiterIsTyped: IsAny<JobLimiter> extends true ? never : JobLimiter extends { max: number; duration: number } ? true : never = true;

export function takesBackoffAndLimiter() {
  defineJob({ backoff: { type: "fixed", delay: 500, jitter: 0.5 }, limiter: { max: 10, duration: 1000 }, handler: () => undefined });

  // @ts-expect-error a backoff has no field named wait
  defineJob({ backoff: { type: "fixed", wait: 500 }, handler: () => undefined });
  // @ts-expect-error a limiter has no field named per
  defineJob({ limiter: { max: 10, per: 1000 }, handler: () => undefined });
}
