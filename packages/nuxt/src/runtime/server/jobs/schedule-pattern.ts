import type {
  ScheduleAt,
  ScheduleDay,
  ScheduleEvery,
  ScheduleHour,
  ScheduleMinute,
  ScheduleMonth,
  ScheduleTiming,
  ScheduleWeekday,
} from "./schedule-timing";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

interface ResolvedAt {
  minutes: number[];
  hours: number[] | "any";
  days: number[] | "any";
  months: number[] | "any";
  weekdays: number[] | "any";
}

function list<T extends string | number>(value: T | readonly T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;

  return typeof value === "object" ? [...value] : [value];
}

function sorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function resolveAt(at: ScheduleAt): ResolvedAt {
  const minutes = list<ScheduleMinute>(at.minute);
  const hours = list<ScheduleHour>(at.hour);
  const days = list<ScheduleDay>(at.day);
  const weekdays = list<ScheduleWeekday>(at.weekday)?.map((weekday) => WEEKDAYS.indexOf(weekday));
  const months = list<ScheduleMonth>(at.month)?.map((month) => MONTHS.indexOf(month) + 1);
  const coarsest = months ? 3 : days || weekdays ? 2 : hours ? 1 : 0;

  return {
    minutes: sorted(minutes ?? [0]),
    hours: hours ? sorted(hours) : coarsest > 1 ? [0] : "any",
    days: days ? sorted(days) : coarsest > 2 && !weekdays ? [1] : "any",
    months: months ? sorted(months) : "any",
    weekdays: weekdays ? sorted(weekdays) : "any",
  };
}

function field(values: number[] | "any"): string {
  return values === "any" ? "*" : values.join(",");
}

function everyPattern(every: ScheduleEvery): string {
  const step = (n: number) => (n === 1 ? "*" : `*/${n}`);

  if (every.seconds !== undefined) return `${step(every.seconds)} * * * * *`;
  if (every.minutes !== undefined) return `${step(every.minutes)} * * * *`;
  if (every.hours !== undefined) return `0 ${step(every.hours)} * * *`;

  return "0 0 * * *";
}

function everyDescription(every: ScheduleEvery): string {
  const each = (n: number, unit: string) => (n === 1 ? `every ${unit}` : `every ${n} ${unit}s`);

  if (every.seconds !== undefined) return each(every.seconds, "second");
  if (every.minutes !== undefined) return each(every.minutes, "minute");
  if (every.hours !== undefined) return each(every.hours, "hour");

  return "every day at 00:00";
}

function twoDigits(n: number): string {
  return String(n).padStart(2, "0");
}

function atDescription(at: ResolvedAt): string {
  if (at.hours === "any") return `every hour at ${at.minutes.map((minute) => `:${twoDigits(minute)}`).join(", ")}`;

  const times = at.hours
    .flatMap((hour) => at.minutes.map((minute) => `${twoDigits(hour)}:${twoDigits(minute)}`))
    .join(", ");
  const days =
    at.weekdays !== "any"
      ? `on ${at.weekdays.map((weekday) => WEEKDAYS[weekday]).join(", ")}`
      : at.days !== "any"
        ? `on day ${at.days.join(", ")}`
        : "every day";
  const months = at.months === "any" ? "" : ` in ${at.months.map((month) => MONTHS[month - 1]).join(", ")}`;

  return `${times} ${days}${months}`;
}

/**
 * The cron pattern BullMQ registers a schedule's timing under: six fields
 * (leading seconds) for `every: { seconds }`, five otherwise.
 */
export function schedulePattern(timing: ScheduleTiming): string {
  if (timing.every) return everyPattern(timing.every);

  const at = resolveAt(timing.at);

  return [at.minutes.join(","), field(at.hours), field(at.days), field(at.months), field(at.weekdays)].join(" ");
}

/**
 * A schedule's timing in words, as `nuxvel schedule:list` prints it:
 * `every 5 minutes`, `03:00 every day`, `09:00 on monday, friday`.
 */
export function describeScheduleTiming(timing: ScheduleTiming): string {
  return timing.every ? everyDescription(timing.every) : atDescription(resolveAt(timing.at));
}
