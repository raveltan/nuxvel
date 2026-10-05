import { defineSchedule } from "../../src/runtime/server/jobs/define-schedule";

const handler = () => {};

defineSchedule({ every: { seconds: 2 }, handler });
defineSchedule({ every: { minutes: 15 }, handler });
defineSchedule({ every: { hours: 6 }, handler });
defineSchedule({ every: { days: 1 }, handler });
defineSchedule({ at: { hour: 3 }, handler });
defineSchedule({ at: { minute: [0, 30] }, handler });
defineSchedule({ at: { hour: [9, 17], weekday: ["monday", "friday"] }, handler });
defineSchedule({ at: { day: [1, 15], hour: 6, minute: 30, month: "january" }, handler });

// @ts-expect-error hours run 0-23
defineSchedule({ at: { hour: 24 }, handler });

// @ts-expect-error 7 does not divide an hour evenly
defineSchedule({ every: { minutes: 7 }, handler });

// @ts-expect-error 5 does not divide a day evenly
defineSchedule({ every: { hours: 5 }, handler });

// @ts-expect-error an interval takes one unit
defineSchedule({ every: { hours: 1, minutes: 30 }, handler });

// @ts-expect-error a schedule runs every an interval or at times, not both
defineSchedule({ every: { minutes: 5 }, at: { hour: 3 }, handler });

// @ts-expect-error a schedule needs every or at
defineSchedule({ handler });

// @ts-expect-error the raw cron option is gone
defineSchedule({ cron: "0 3 * * *", handler });

// @ts-expect-error cron would run on the day or the weekday, so they cannot be combined
defineSchedule({ at: { day: 1, weekday: "monday" }, handler });

// @ts-expect-error at needs at least one field
defineSchedule({ at: {}, handler });

// @ts-expect-error weekdays are named
defineSchedule({ at: { weekday: 1 }, handler });

// @ts-expect-error an empty array matches nothing
defineSchedule({ at: { hour: [] }, handler });
