import { describe, it } from "vitest";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

interface Seen {
  afterRollback: string[];
  beforeCommit: string[];
  afterCommit: string[];
  outside: string[];
}

describe("the methods of a definition", async () => {
  await setupPlayground();

  it.for([
    ["job", "$jobs.x.dispatch()"],
    ["channel", "$channels.x.broadcast()"],
    ["mail", "$mails.x.send()"],
    ["event", "$events.x.emit()"],
    ["notification", "$notifications.x.notify()"],
  ])("%s: %s waits for the commit, does nothing after a rollback and runs at once outside a transaction", async ([kind]) => {
    const user = await userFactory();
    const seen = await guest().$fetch<Seen>("/api/_definition-methods-check", { query: { userId: user.id } });

    expect(seen.afterRollback).not.toContain(kind);
    expect(seen.beforeCommit).not.toContain(kind);
    expect(seen.afterCommit).toContain(kind);
    expect(seen.outside).toContain(kind);
  });
});
