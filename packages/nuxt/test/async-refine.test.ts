import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("schemas with an async refine", async () => {
  await setupPlayground();

  it("validate job, event, emit, mail and broadcast inputs", async () => {
    expect(await guest().$fetch("/api/_async-refine-check")).toEqual({
      job: { seen: [{ title: "free" }], rejected: { title: ["That title is taken"] } },
      event: { parsed: { title: "free" }, rejected: { title: ["That title is taken"] } },
      mail: { subject: "Checked, Ada", rejected: { name: ["That name is taken"] } },
      broadcast: { rejected: { title: ["That title is rejected"] } },
    });
  });
});
