import { describe, it } from "vitest";
import { expectEmitted, expectNotEmitted, guest } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("the events fake", async () => {
  await setupPlayground();

  it("records an emit after the commit and nothing for a rolled-back transaction", async () => {
    await guest().$fetch("/api/_emit-rollback");

    await expectNotEmitted("_probe.happened", { name: "rolled-back" });
    await expectEmitted("_probe.happened", { name: "committed" });
  });
});
