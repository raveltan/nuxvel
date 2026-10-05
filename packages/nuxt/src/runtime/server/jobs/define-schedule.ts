import { actorContext } from "../actions/context";
import { systemActor } from "../actions/system-actor";
import { awaitingName } from "../discovery/definition-name";
import { describeScheduleTiming, schedulePattern } from "./schedule-pattern";
import type { ScheduleTiming } from "./schedule-timing";

/**
 * A schedule definition: its name, when it runs, and the work it runs.
 * The name is its file's path under `server/schedules/`; `pattern` is
 * the cron pattern its `every` or `at` compiles to and `description`
 * the same in words.
 */
export interface Schedule<Name extends string = string> {
  readonly name: Name;
  readonly pattern: string;
  readonly description: string;
  run: () => Promise<void>;
}

/**
 * Defines a scheduled task: work the `nuxvel queue:work` process runs on
 * a clock, with no dispatch behind it.
 *
 * `defineSchedule` is auto-imported. One schedule per file, under
 * `server/schedules/`; the file is discovered, so nothing registers it,
 * and its path is the schedule's name (`server/schedules/posts/prune-
 * drafts.ts` is `"posts.prune-drafts"`), which identifies the repeatable
 * job in Redis and is what `nuxvel schedule:list` prints. The worker
 * registers each discovered schedule as a BullMQ repeatable job on
 * startup, so a change here needs a worker restart; `nuxvel
 * schedule:prune` removes what a moved or deleted one left in Redis, and
 * {@link renamed} at the old path keeps a moved one on its old entry.
 *
 * Give it exactly one of `every` and `at`; times are in the worker's
 * timezone (`TZ`, else the system's). Throws if both or neither are
 * given. Across a daylight-saving change the schedule follows the wall
 * clock: a time with an `hour` in the hour skipped in spring runs an
 * hour late that day (02:30 at 03:30), and one in the hour repeated in
 * autumn runs once; a schedule that ticks every hour or more often has
 * no tick in the skipped hour and ticks twice in the repeated one. Run
 * the worker with `TZ=UTC` to avoid both.
 *
 * The handler runs as `systemActor(name)`, with the schedule's name, so
 * `audit()` and actions work in it without an actor option. Policy rules
 * reject that actor unless wrapped in {@link allowSystem}. The handler
 * gets no transaction: wrap its writes in {@link transaction} when they
 * must commit together.
 *
 * A handler that throws is retried like any job — see {@link JOB_OPTIONS}
 * — and a tick can run twice, so keep the handler safe to repeat.
 *
 * @param config.every An interval, in one unit that divides the next
 * evenly: `{ seconds: 30 }`, `{ minutes: 5 }`, `{ hours: 6 }`, `{ days: 1 }`
 * (midnight).
 * @param config.at Clock times: `minute` (`0`–`59`), `hour` (`0`–`23`),
 * `day` (`1`–`31`) or `weekday` (by name), and `month` (by name), each a
 * value or an array meaning "any of these". Fields finer than the
 * coarsest given default to their first value, coarser ones to "any":
 * `{ hour: 3 }` is 03:00 daily.
 * @param config.handler The work itself. It takes no payload.
 *
 * @example
 * ```ts
 * // server/schedules/posts/prune-drafts.schedule.ts
 * export const postsPruneDraftsSchedule = defineSchedule({
 *   at: { hour: 3 },
 *   async handler() {
 *     await archiveOldDraftsAction({});
 *   },
 * });
 * ```
 */
export function defineSchedule(
  config: ScheduleTiming & {
    handler: () => void | Promise<void>;
  },
): Schedule {
  if ((config.every === undefined) === (config.at === undefined)) {
    throw new Error("nuxvel: defineSchedule takes exactly one of `every` and `at`");
  }

  const schedule: Schedule = awaitingName(
    {
      name: "",
      pattern: schedulePattern(config),
      description: describeScheduleTiming(config),
      async run() {
        await actorContext.run(systemActor(schedule.name), config.handler);
      },
    },
    "schedule",
  );

  return schedule;
}
