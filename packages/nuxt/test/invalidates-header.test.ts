import { actingAs, expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { readInvalidatesHeader } from "../src/runtime/shared/trpc/invalidates-header";
import { setupPlayground } from "./helpers/playground";

async function call(procedure: string, input: Record<string, boolean> = {}) {
  const client = actingAs(await userFactory());
  const path = `/api/trpc/_invalidatesCheck.${procedure}`;

  return procedure === "query"
    ? client.fetch(path)
    : client.fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      });
}

describe("the x-nuxvel-invalidates header", async () => {
  await setupPlayground();

  it("names the tags the mutation's actions invalidated, a glob as the prefix before it", async () => {
    const response = await call("declared", { nested: false, fail: false });

    expect(response.status).toBe(200);
    expect(readInvalidatesHeader(response.headers)).toEqual([["post", { id: 1 }], ["posts"], ["post", "list"]]);
  });

  it("merges the tags of a nested action", async () => {
    const response = await call("declared", { nested: true, fail: false });

    expect(readInvalidatesHeader(response.headers)).toEqual([["comment"], ["post", { id: 1 }], ["posts"], ["post", "list"]]);
  });

  it("is absent when no action declared invalidates", async () => {
    const response = await call("nothing");

    expect(response.status).toBe(200);
    expect(response.headers.has("x-nuxvel-invalidates")).toBe(false);
  });

  it("is an empty list for invalidates: []", async () => {
    expect(readInvalidatesHeader((await call("empty")).headers)).toEqual([]);
  });

  it("is absent when the mutation fails and its transaction rolls back", async () => {
    const response = await call("declared", { nested: true, fail: true });

    expect(response.status).toBe(500);
    expect(response.headers.has("x-nuxvel-invalidates")).toBe(false);
  });

  it("is absent on a query", async () => {
    const response = await call("query");

    expect(response.status).toBe(200);
    expect(response.headers.has("x-nuxvel-invalidates")).toBe(false);
  });
});
