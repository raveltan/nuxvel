import { stripVTControlCharacters } from "node:util";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { getServerLogs } from "@nuxt/test-utils/e2e";

async function prettyLogs(until: string) {
  return vi.waitFor(() => {
    const logs = stripVTControlCharacters(getServerLogs().join("\n"));

    expect(logs).toContain(until);

    return logs;
  });
}

describe("a pretty log line", () => {
  it("leaves out only the fields whose whole value the message already shows", async () => {
    await guest().$fetch("/api/_pretty-log-check");

    const logs = await prettyLogs("#16 done");

    expect(logs).toMatch(/ user\.send-digest #16 done  attempt=1 req=\w+$/m);
  });

  it("prints the cause chain of an error under it, with each cause's stack", async () => {
    await guest().$fetch("/api/_pretty-log-check");

    const logs = await prettyLogs("pretty error with causes");

    expect(logs).toMatch(
      /pretty error with causes[^\n]*\nError: pretty outer failure\n(\s+at .*\n)+Caused by: Error: pretty middle failure\n(\s+at .*\n)+Caused by: Error: pretty inner failure\n\s+at /,
    );
  });

  it("keeps a warning on one line, with the innermost cause's message", async () => {
    await guest().$fetch("/api/_pretty-log-check");

    const logs = await prettyLogs("pretty warning with causes");

    expect(logs).toMatch(/pretty warning with causes .*err="pretty outer failure" cause="pretty inner failure"$/m);
  });

  it("prints the hint of a record on its own line before the stack, not as a field", async () => {
    await guest().$fetch("/api/_pretty-log-check");

    const logs = await prettyLogs("pretty error with hint");

    expect(logs).toMatch(/pretty error with hint[^\n]*\n {2}→ pretty hint text\nError: pretty outer failure\n/);
    expect(logs).toMatch(/pretty warning with hint[^\n]*\n {2}→ pretty hint text$/m);
    expect(logs).not.toContain("hint=");
  });

  it("logs an error whose cause is the error itself, with a bounded cause chain", async () => {
    expect(await guest().$fetch("/api/_cyclic-cause-check")).toEqual({ logged: true });

    const logs = await prettyLogs("cyclic cause logged");
    const line = logs.slice(logs.lastIndexOf("cyclic cause logged"));

    expect(line.match(/Caused by: Error: cyclic cause failure/g)?.length).toBeLessThanOrEqual(6);
  });
});
