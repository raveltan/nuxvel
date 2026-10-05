import { z } from "zod";
import { queueNames, useQueue } from "../../jobs/queue";
import { useRedis } from "../../redis/client";
import { defineDevtoolsSection } from "../define-devtools-section";
import type { JobsSectionData } from "../../../shared/devtools/sections/jobs";

const RECENT_LIMIT = 20;

const STATES = [
  ["active", "active"],
  ["waiting", "wait"],
  ["delayed", "delayed"],
  ["prioritized", "prioritized"],
  ["completed", "completed"],
  ["failed", "failed"],
] as const;

const RECENT_JOBS_SCRIPT = `
local limit = tonumber(ARGV[2])
local counts = {}
local jobs = {}
for i, key in ipairs(KEYS) do
  local ids
  if redis.call("TYPE", key)["ok"] == "list" then
    counts[i] = redis.call("LLEN", key)
    ids = redis.call("LRANGE", key, 0, limit - 1)
  else
    counts[i] = redis.call("ZCARD", key)
    ids = redis.call("ZREVRANGE", key, 0, limit - 1)
  end
  for _, id in ipairs(ids) do
    local job = redis.call("HMGET", ARGV[1] .. id, "name", "timestamp", "atm", "failedReason", "delay", "priority")
    table.insert(jobs, { i, id, job[1] or "", job[2] or "0", job[3] or "0", job[4] or "", job[5] or "0", job[6] or "0" })
  end
end
return { counts, jobs }
`;

const scriptResult = z.tuple([
  z.array(z.number()),
  z.array(z.tuple([z.number(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string()])),
]);

async function recentJobsIn(name: string) {
  const queue = useQueue(name);
  const keys = STATES.map(([, key]) => queue.toKey(key));
  const [counts, rows] = scriptResult.parse(
    await useRedis("queue").eval(RECENT_JOBS_SCRIPT, keys.length, ...keys, queue.toKey(""), RECENT_LIMIT),
  );

  return {
    counts,
    jobs: rows.map(([state, id, jobName, timestamp, attemptsMade, failedReason, delay, priority]) => ({
      queue: name,
      id,
      name: jobName,
      state: STATES[state - 1]?.[0] ?? "unknown",
      attemptsMade: Number(attemptsMade),
      failedReason: failedReason || null,
      delay: Number(delay),
      priority: Number(priority),
      timestamp: Number(timestamp),
    })),
  };
}

async function recentJobs() {
  const queues = await Promise.all(queueNames().map(recentJobsIn));
  const jobs = queues
    .flatMap((queue) => queue.jobs)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, RECENT_LIMIT)
    .map(({ timestamp, ...job }) => ({ ...job, queuedAt: new Date(timestamp).toISOString() }));

  return {
    counts: Object.fromEntries(
      STATES.map(([state], index) => [state, queues.reduce((sum, queue) => sum + (queue.counts[index] ?? 0), 0)]),
    ),
    jobs,
  };
}

export default defineDevtoolsSection<JobsSectionData>({
  id: "jobs",
  title: "Recent jobs",
  order: 10,
  load: recentJobs,
});
