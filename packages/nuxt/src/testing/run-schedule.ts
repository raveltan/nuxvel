import type { ScheduleName } from "../runtime/server/jobs/schedule-registry";
import { callApp } from "./settled";

/**
 * Runs a {@link defineSchedule} handler, by its name, in the app under
 * test, here and now, as one tick of the schedule.
 *
 * No worker and no clock are involved, so the handler's effect is there
 * when the call resolves; a handler that throws rejects with its error.
 * Call it twice to check that a tick is safe to repeat, and move the
 * clock between calls with {@link travelBy}.
 *
 * @param name A {@link ScheduleName}; a name no schedule defines fails to
 * compile.
 *
 * @example
 * ```ts
 * await travelBy({ days: 8 });
 * await runSchedule("posts.prune-drafts");
 * await expectNoRow(postTable, { id: draft.id });
 * ```
 */
export async function runSchedule(name: ScheduleName): Promise<void> {
  await callApp("run-schedule", { name });
}
