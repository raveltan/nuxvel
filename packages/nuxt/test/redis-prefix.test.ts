import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("NUXT_REDIS_PREFIX", async () => {
  await setupPlayground({ env: { NUXT_REDIS_PREFIX: "tasks:" } });

  it("puts every Redis key and pub/sub channel of the app under the prefix", async () => {
    const { keys, topics } = await guest().$fetch<{ keys: string[]; topics: string[] }>("/api/_redis-prefix-check");

    expect(keys).toEqual(expect.arrayContaining([
      expect.stringMatching(/^tasks:nuxvel:(test\d+:)?cache:probe:prefixed$/),
      expect.stringMatching(/^tasks:nuxvel:(test\d+:)?rate-limit:/),
      expect.stringMatching(/^tasks:bull:nuxvel:/),
      expect.stringMatching(/^tasks:nuxvel:channel:.+:replay$/),
    ]));
    expect(keys.filter((key) => !key.startsWith("tasks:"))).toEqual([]);
    expect(topics.filter((topic) => !topic.startsWith("tasks:"))).toEqual([]);
  });
});
