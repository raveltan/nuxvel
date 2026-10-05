import { writeFile } from "node:fs/promises";
import type { JobType } from "bullmq";
import { count, isNull } from "drizzle-orm";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { allListeners, listenerAliases } from "../events/registry";
import { listenerJobName } from "../events/queue-name";
import { experimentStateKey } from "../flags/experiment-state";
import { flagDefinitions, flagStoredName } from "../flags/registry";
import { flagTargetingKey } from "../flags/targeting";
import { queueNames, useQueue } from "../jobs/queue";
import { allJobs, jobAliases } from "../jobs/registry";
import { allSchedules, scheduleStoredName } from "../jobs/schedule-registry";
import { useRedis } from "../redis/client";
import type { OrphanedNames } from "./orphaned-names";
import { orphanedSchedulers } from "./schedules";

const STORED_JOB_STATES: JobType[] = ["waiting", "delayed", "prioritized", "active", "waiting-children", "failed"];

function queuedNames() {
  const queuedListeners = [...allListeners(), ...listenerAliases().map((alias) => ({ ...alias.renamedTo, name: alias.name }))]
    .filter((listener) => !listener.sync)
    .map((listener) => listenerJobName(listener.name));

  return new Set([
    ...allJobs().map((job) => job.name),
    ...jobAliases().map((alias) => alias.name),
    ...queuedListeners,
    ...allSchedules().map(scheduleStoredName),
  ]);
}

function tally(names: string[]) {
  const counts = new Map<string, number>();

  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);

  return [...counts];
}

async function keysUnder(prefix: string) {
  const keys: string[] = [];
  let cursor = "0";

  do {
    const [next, found] = await useRedis("durable").scan(cursor, "MATCH", `${prefix}*`, "COUNT", 1000);

    cursor = next;
    keys.push(...found.map((key) => key.slice(prefix.length)));
  } while (cursor !== "0");

  return keys;
}

async function orphanedJobs(known: Set<string>): Promise<OrphanedNames> {
  const jobs = (await Promise.all(queueNames().map((queue) => useQueue(queue).getJobs(STORED_JOB_STATES)))).flat();

  return tally(jobs.map((job) => job.name).filter((name) => !known.has(name))).map(([name, total]) => ({
    kind: "queued job",
    name,
    count: total,
  }));
}

async function orphanedOutboxRows(known: Set<string>): Promise<OrphanedNames> {
  const outbox = schemaTable("outbox");
  const rows = await useDb()
    .select({ name: outbox.jobName, total: count() })
    .from(outbox)
    .where(isNull(outbox.dispatchedAt))
    .groupBy(outbox.jobName);

  return rows
    .filter((row) => !known.has(row.name))
    .map((row) => ({ kind: "outbox row", name: row.name, count: row.total }));
}

async function orphanedSchedulerNames(): Promise<OrphanedNames> {
  return orphanedSchedulers(await useQueue().getJobSchedulers()).map((scheduler) => ({
    kind: "scheduler",
    name: scheduler.key,
    count: 1,
  }));
}

async function orphanedFlagState(): Promise<OrphanedNames> {
  const stored = (kind: "flag" | "experiment") =>
    new Set(flagDefinitions().filter((definition) => definition.kind === kind).map(flagStoredName));
  const flags = stored("flag");
  const experiments = stored("experiment");

  return [
    ...(await keysUnder(flagTargetingKey("")))
      .filter((name) => !flags.has(name))
      .map((name) => ({ kind: "flag state" as const, name, count: 1 })),
    ...(await keysUnder(experimentStateKey("")))
      .filter((name) => !experiments.has(name))
      .map((name) => ({ kind: "experiment state" as const, name, count: 1 })),
  ];
}

export async function runOrphanedNames(outFile: string): Promise<number> {
  const known = queuedNames();
  const orphans: OrphanedNames = [
    ...(await orphanedJobs(known)),
    ...(await orphanedOutboxRows(known)),
    ...(await orphanedSchedulerNames()),
    ...(await orphanedFlagState()),
  ];

  await writeFile(outFile, JSON.stringify(orphans));

  return 0;
}
