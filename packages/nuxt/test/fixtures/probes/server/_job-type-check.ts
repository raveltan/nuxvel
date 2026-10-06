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

type NamespacedJob = typeof $jobs._probe.namedExport;

export const jobsNamespaceIsTyped: IsAny<NamespacedJob> extends true ? never : NamespacedJob extends Job ? true : never = true;
export const nestedJobIsReachable: Job = $jobs.post.notifyFollowers;

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const jobDispatcherIsTyped = defineJob({
  handler: (_input, { dispatcher }) => {
    const dispatcherIsActor: Equals<typeof dispatcher, Actor | null> extends true ? true : never = true;

    return dispatcherIsActor;
  },
});

export async function dispatchesAsADispatcher() {
  await $jobs._probe.record.dispatch({ name: "typed" }, { dispatcher: systemActor("typed") });
  await $jobs._probe.record.dispatch({ name: "typed" }, { dispatcher: null });

  // @ts-expect-error a dispatcher is an actor
  await $jobs._probe.record.dispatch({ name: "typed" }, { dispatcher: "system" });
}

type DispatchInput = Parameters<typeof $jobs._probe.record.dispatch>[0];

export const dispatchInputIsTyped: IsAny<DispatchInput> extends true
  ? never
  : DispatchInput extends { name: string }
    ? true
    : never = true;

export async function dispatchesThroughTheDefinition() {
  await $jobs._probe.record.dispatch({ name: "typed" });
  await $jobs._probe.record.dispatch({ name: "typed" }, { delay: { seconds: 30 }, priority: 1, dispatcher: null });
  await $jobs._probe.alwaysFails.dispatch();

  // @ts-expect-error the definition's input takes a string name
  await $jobs._probe.record.dispatch({ name: 1 });
  // @ts-expect-error the definition's input needs its name
  await $jobs._probe.record.dispatch();
  // @ts-expect-error no job is named probe.missing
  await $jobs.probe.missing.dispatch({});
}

export async function takesDurations() {
  defineJob({ timeout: { seconds: 30 }, backoff: { minutes: 1 }, handler: () => undefined });
  defineJob({ backoff: { type: "exponential", delay: 1000 }, handler: () => undefined });
  signedUrl("/invites/1", { expiresIn: { days: 7 } });

  // @ts-expect-error a timeout is a duration, not milliseconds
  defineJob({ timeout: 30_000, handler: () => undefined });
  // @ts-expect-error a delay is a duration, not milliseconds
  await $jobs._probe.record.dispatch({ name: "typed" }, { delay: 60_000 });
  // @ts-expect-error an expiry is a duration, not seconds
  signedUrl("/invites/1", { expiresIn: 60 });
}
