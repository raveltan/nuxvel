import { listenerJobName } from "../events/queue-name";
import { allListeners, listenerAliases } from "../events/registry";
import { allJobs, jobAliases } from "../jobs/registry";
import { allSchedules, scheduleStoredName } from "../jobs/schedule-registry";

type Handler = (data: unknown, attempt: { last: boolean }) => Promise<void>;

export function handlersByName() {
  const handlers: { name: string; run: Handler }[] = [
    ...allJobs(),
    ...jobAliases().map((alias) => ({ name: alias.name, run: alias.renamedTo.run })),
    ...allListeners()
      .filter((listener) => !listener.sync)
      .map((listener) => ({ name: listenerJobName(listener.name), run: (data: unknown) => listener.runQueued(data) })),
    ...listenerAliases()
      .filter((alias) => !alias.renamedTo.sync)
      .map((alias) => ({ name: listenerJobName(alias.name), run: (data: unknown) => alias.renamedTo.runQueued(data) })),
    ...allSchedules().map((schedule) => ({ name: scheduleStoredName(schedule), run: () => schedule.run() })),
  ];
  const byName = new Map<string, Handler>();

  for (const { name, run } of handlers) {
    if (byName.has(name)) {
      throw new Error(`nuxvel queue:work: more than one job, queued listener or schedule is named "${name}"`);
    }

    byName.set(name, run);
  }

  return byName;
}
