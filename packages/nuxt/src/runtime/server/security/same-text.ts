import { timingSafeEqual } from "node:crypto";

export function sameText(expected: string, given: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);

  return a.length === b.length && timingSafeEqual(a, b);
}
