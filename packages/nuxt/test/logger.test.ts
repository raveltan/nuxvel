import { stripVTControlCharacters } from "node:util";
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it, vi } from "vitest";
import { clearServerLogs, getServerLogs } from "@nuxt/test-utils/e2e";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";
import { prettyLine } from "../src/runtime/server/logging/pretty-reporter";
import { type LogRecord, serializedError } from "../src/runtime/server/logging/log-record";

async function loggedLines(count: number, send: () => Promise<unknown>) {
  clearServerLogs();
  await send();

  return vi.waitFor(() => {
    const lines = getServerLogs().filter((line) => line.includes('"tag":"logger-check"'));

    expect(lines).toHaveLength(count);

    return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  });
}

describe("useLogger", async () => {
  await setupPlayground();

  it("writes one JSON line per call with time, level, tag and msg, and drops debug at info", async () => {
    const lines = await loggedLines(4, () => guest().$fetch("/api/_logger-check"));

    expect(lines.map((line) => line.level)).toEqual(["info", "warn", "error", "fatal"]);

    for (const line of lines) {
      expect(new Date(String(line.time)).toISOString()).toBe(line.time);
      expect(line.tag).toBe("logger-check");
    }

    expect(lines[0]).toMatchObject({ msg: "logger-check info", answer: 42 });
  });

  it("puts an error under err with its message and stack", async () => {
    const [, , error] = await loggedLines(4, () => guest().$fetch("/api/_logger-check"));

    expect(error).toMatchObject({
      msg: "logger-check error",
      err: { name: "Error", message: "logger-check boom", stack: expect.stringContaining("logger-check boom") },
    });
  });

  it("tags a line logged in an authed tRPC call with the request id and the user", async () => {
    const user = await userFactory({ email: "logger-authed@example.com" });
    const [line] = await loggedLines(1, () =>
      actingAs(user).$fetch("/api/trpc/_loggerCheck.authed", { headers: { "x-request-id": "logger-authed-request" } }),
    );

    expect(line).toMatchObject({ msg: "logger-check authed", requestId: "logger-authed-request", actor: `user:${user.id}` });
  });

  it("leaves both out outside a request, and never looks a session up to name the actor", async () => {
    const user = await userFactory({ email: "logger-unresolved@example.com" });
    const [inRequest, outside] = await loggedLines(2, () =>
      actingAs(user).$fetch("/api/_logger-context-check", { headers: { "x-request-id": "logger-context-request" } }),
    );

    expect(inRequest).toMatchObject({ msg: "logger-check in request", requestId: "logger-context-request" });
    expect(inRequest).not.toHaveProperty("actor");
    expect(outside).toMatchObject({ msg: "logger-check outside request" });
    expect(outside).not.toHaveProperty("requestId");
    expect(outside).not.toHaveProperty("actor");
  });

  describe("the cause of a warning line", () => {
    function warnLine(error: Error) {
      const record = { time: new Date(), level: "warn", tag: "", msg: "retry", fields: {}, context: {}, err: serializedError(new Error("job failed", { cause: error })) };

      return stripVTControlCharacters(prettyLine(record as LogRecord));
    }

    it("shows the code of an error with an empty message", () => {
      const refused = Object.assign(new AggregateError([new Error("connect refused")], ""), { code: "ECONNREFUSED" });

      expect(warnLine(refused)).toContain('cause="ECONNREFUSED"');
    });

    it("shows the message of the first inner error when the message and the code are empty", () => {
      expect(warnLine(new AggregateError([new Error("connect refused")], ""))).toContain('cause="connect refused"');
    });
  });
});
