import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("defineJob", async () => {
  await setupPlayground();

  it("passes valid payloads to the handler and throws the Phase-4 shape on invalid ones", async () => {
    const body = await guest().$fetch("/api/_define-job-check");

    expect(body.seen).toEqual([{ title: "Hello", views: 3 }, {}, "undefined"]);
    expect(body.invalidThrew).toBe(true);
    expect(Object.keys(body.fields)).toEqual(
      expect.arrayContaining(["title", "views"]),
    );
  });

  it("leaves an unregistered job's name out of spreads and JSON, while reading it still throws", async () => {
    const { unnamed } = await guest().$fetch("/api/_define-job-check");

    expect(unnamed.spreadKeys).toEqual(expect.arrayContaining(["version", "run"]));
    expect(unnamed.spreadKeys).not.toContain("name");
    expect(unnamed.json).toMatchObject({ version: 3 });
    expect(unnamed.json).not.toHaveProperty("name");
    expect(unnamed.nameError).toContain("nuxvel: this job has no name yet");
    expect(unnamed.registeredSpreadName).toBe("_define-job-check.echo");
  });
});
