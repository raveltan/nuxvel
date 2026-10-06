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

export async function dispatchesOnlyDefinedJobs() {
  await dispatchAfterCommit("_probe.record", { name: "typed" });

  // @ts-expect-error no job is named probe.missing
  await dispatchAfterCommit("probe.missing", {});
  // @ts-expect-error _probe.record takes a string name
  await dispatchAfterCommit("_probe.record", { name: 1 });
}

export async function dispatchesADefinition() {
  await dispatchAfterCommit($jobs._probe.record, { name: "typed" }, { delay: 0 });
  await dispatchAfterCommit($jobs._probe.namedExport, { name: "typed" });

  // @ts-expect-error the definition's input takes a string name
  await dispatchAfterCommit($jobs._probe.record, { name: 1 });
  // @ts-expect-error the definition's input needs its name
  await dispatchAfterCommit($jobs._probe.namedExport, {});
}

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
  await dispatchAfterCommit("_probe.record", { name: "typed" }, { dispatcher: systemActor("typed") });
  await dispatchAfterCommit("_probe.record", { name: "typed" }, { dispatcher: null });

  // @ts-expect-error a dispatcher is an actor
  await dispatchAfterCommit("_probe.record", { name: "typed" }, { dispatcher: "system" });
}
