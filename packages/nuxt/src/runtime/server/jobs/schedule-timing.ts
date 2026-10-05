type OneOrMore<T> = T | readonly [T, ...T[]];

type DivisorOf60 = 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
type DivisorOf24 = 1 | 2 | 3 | 4 | 6 | 8 | 12;

/**
 * An interval for {@link defineSchedule}'s `every`: exactly one unit,
 * and only a step that divides the next unit evenly (seconds and minutes
 * by 60, hours by 24), so every tick lands at the same place on the
 * clock. `{ days: 1 }` runs at midnight; use `at` for a weekly or
 * monthly schedule. A rate limit's {@link RateLimitWindow} shares the
 * unit names but is a duration: its units add up, with no divisor rule.
 */
export type ScheduleEvery =
  | { seconds: DivisorOf60; minutes?: never; hours?: never; days?: never }
  | { minutes: DivisorOf60; seconds?: never; hours?: never; days?: never }
  | { hours: DivisorOf24; seconds?: never; minutes?: never; days?: never }
  | { days: 1; seconds?: never; minutes?: never; hours?: never };

/** A minute of the hour, `0`–`59`. */
export type ScheduleMinute =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19
  | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29
  | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39
  | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49
  | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59;

/** An hour of the day, `0`–`23`. */
export type ScheduleHour =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
  | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23;

/** A day of the month, `1`–`31`. */
export type ScheduleDay =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20
  | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31;

/** A day of the week, by name. */
export type ScheduleWeekday = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

/** A month, by name. */
export type ScheduleMonth =
  | "january" | "february" | "march" | "april" | "may" | "june"
  | "july" | "august" | "september" | "october" | "november" | "december";

type AtFields = {
  minute?: OneOrMore<ScheduleMinute>;
  hour?: OneOrMore<ScheduleHour>;
  month?: OneOrMore<ScheduleMonth>;
};

type AtDay =
  | { day: OneOrMore<ScheduleDay>; weekday?: never }
  | { weekday: OneOrMore<ScheduleWeekday>; day?: never }
  | { day?: never; weekday?: never };

type AtLeastOne =
  | { minute: OneOrMore<ScheduleMinute> }
  | { hour: OneOrMore<ScheduleHour> }
  | { day: OneOrMore<ScheduleDay> }
  | { weekday: OneOrMore<ScheduleWeekday> }
  | { month: OneOrMore<ScheduleMonth> };

/**
 * Clock times for {@link defineSchedule}'s `at`. Each field takes one
 * value or an array meaning "any of these". A field left out finer than
 * the coarsest one given is its first value (minute `0`, hour `0`, day
 * `1`); one coarser than it is "any". So `{ hour: 3 }` is 03:00 every
 * day, `{ minute: 15 }` is a quarter past every hour, `{ weekday:
 * "monday" }` is Monday at 00:00 and `{ month: "january" }` is January
 * 1st at 00:00. `day` and `weekday` cannot be combined. `minute` is a
 * clock time, not a step: for every n minutes use
 * {@link ScheduleEvery} (`every: { minutes: n }`).
 */
export type ScheduleAt = AtFields & AtDay & AtLeastOne;

/**
 * When a schedule runs: `every` an interval or `at` clock times, exactly
 * one of the two.
 */
export type ScheduleTiming = { every: ScheduleEvery; at?: never } | { at: ScheduleAt; every?: never };
