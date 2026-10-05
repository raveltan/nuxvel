import { writeFile } from "node:fs/promises";
import type { JobType } from "bullmq";
import { allListeners, listenerAliases } from "../events/registry";
import { listenerJobName } from "../events/queue-name";
import { queueNames, useQueue } from "../jobs/queue";
import { allJobs, jobAliases } from "../jobs/registry";
import { allSchedules, scheduleStoredName } from "../jobs/schedule-registry";
import type { QueueVersionsListing } from "./queue-versions-listing";

type Definition = { name: string; version: number; upcasters: number[] };

type Group = { name: string; version: number | null; count: number; delayed: number; prioritized: number };

const PENDING_STATES: JobType[] = ["waiting", "delayed", "prioritized", "active", "waiting-children"];

function readVersion(data: unknown) {
  if (data && typeof data === "object" && "version" in data && typeof data.version === "number") {
    return data.version;
  }

  return null;
}

function problem(group: Group, definitions: Map<string, Definition>) {
  const definition = definitions.get(group.name);

  if (!definition) return "nothing in code defines this name";
  if (group.version === null) return "not a { version, payload } envelope";
  if (group.version > definition.version) {
    return `newer than the defined version ${definition.version}`;
  }

  for (let version = group.version; version < definition.version; version += 1) {
    if (!definition.upcasters.includes(version)) {
      return `no upcaster for version ${version}`;
    }
  }

  return null;
}

function definitionsByName() {
  const queuedListeners = allListeners()
    .filter((listener) => !listener.sync)
    .map((listener) => ({ ...listener, name: listenerJobName(listener.name) }));
  const queuedListenerAliases = listenerAliases()
    .filter((alias) => !alias.renamedTo.sync)
    .map((alias) => ({ ...alias.renamedTo, name: listenerJobName(alias.name) }));
  const renamedJobs = jobAliases().map((alias) => ({ ...alias.renamedTo, name: alias.name }));

  return new Map<string, Definition>(
    [...allJobs(), ...renamedJobs, ...queuedListeners, ...queuedListenerAliases].map((definition) => [
      definition.name,
      definition,
    ]),
  );
}

export async function runQueueVersions(outFile: string): Promise<number> {
  const definitions = definitionsByName();
  const scheduleNames = new Set(allSchedules().map(scheduleStoredName));
  const groups = new Map<string, Group>();

  for (const queue of queueNames()) {
    for (const state of PENDING_STATES) {
      for (const job of await useQueue(queue).getJobs([state])) {
        const version = readVersion(job.data);
        const key = `${job.name} ${version}`;
        const group = groups.get(key) ?? { name: job.name, version, count: 0, delayed: 0, prioritized: 0 };

        group.count += 1;
        if (state === "delayed") group.delayed += 1;
        if (state === "prioritized") group.prioritized += 1;
        groups.set(key, group);
      }
    }
  }

  const listing: QueueVersionsListing = {
    groups: [...groups.values()]
      .sort((a, b) => a.name.localeCompare(b.name) || (a.version ?? 0) - (b.version ?? 0))
      .map((group) => {
        const schedule = scheduleNames.has(group.name);

        return { ...group, schedule, problem: schedule ? null : problem(group, definitions) };
      }),
  };

  await writeFile(outFile, JSON.stringify(listing));

  return 0;
}
