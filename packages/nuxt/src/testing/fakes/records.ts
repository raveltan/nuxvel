import { expect } from "vitest";

const listed = 10;

function describeRecords(records: unknown[]) {
  if (records.length === 0) return "none";

  const lines = records.slice(0, listed).map((record) => `  ${JSON.stringify(record)}`);
  if (records.length > listed) lines.push(`  … and ${records.length - listed} more`);

  return `\n${lines.join("\n")}`;
}

export function includes(match: object | undefined) {
  const matcher = expect.objectContaining<unknown>(match ?? {});

  return (value: unknown) => matcher.asymmetricMatch(value);
}

export function expectRecorded<R>(
  helper: string,
  what: string,
  records: R[],
  matches: (record: R) => boolean,
  times?: number,
): R {
  if (times !== undefined && times < 1) {
    throw new Error(`${helper}: times must be 1 or more. Use the negative helper to assert that nothing was recorded.`);
  }

  const matching = records.filter(matches);
  const latest = matching.at(-1);

  if (latest === undefined || (times !== undefined && matching.length !== times)) {
    throw new Error(
      `${helper}: expected ${what}${times === undefined ? "" : ` ${times} ${times === 1 ? "time" : "times"}`}, found ${matching.length}. Recorded: ${describeRecords(records)}`,
    );
  }

  return latest;
}

export function expectNotRecorded<R>(helper: string, what: string, records: R[], matches: (record: R) => boolean): void {
  const matching = records.filter(matches);

  if (matching.length > 0) {
    throw new Error(`${helper}: expected no ${what.replace(/^an? /, "")}, found ${matching.length}: ${describeRecords(matching)}`);
  }
}
