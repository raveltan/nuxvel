import { useQueue } from "../../jobs/queue";
import { allSchedules, scheduleStoredName } from "../../jobs/schedule-registry";
import { defineDevtoolsSection } from "../define-devtools-section";
import type { SchedulesSectionData } from "../../../shared/devtools/sections/schedules";

export default defineDevtoolsSection<SchedulesSectionData>({
  id: "schedules",
  title: "Schedules",
  order: 50,
  load: async () => {
    const registered = new Map(
      (await useQueue().getJobSchedulers()).map((scheduler) => [scheduler.key, scheduler.next]),
    );

    return allSchedules()
      .map((schedule) => {
        const storedAs = scheduleStoredName(schedule);
        const next = registered.get(storedAs);

        return {
          name: schedule.name,
          description: schedule.description,
          pattern: schedule.pattern,
          nextRun: next ? new Date(next).toISOString() : null,
          storedAs: storedAs === schedule.name ? null : storedAs,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
