import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { CONSOLE_PROBE_MESSAGE, consoleProbeChunk } from "./helpers/console-probe";
import { playgroundBuild } from "./helpers/playground";

describe("the production client bundle", () => {
  it("has the probe page's console call and debugger statement stripped", () => {
    const chunk = consoleProbeChunk(playgroundBuild().outputDir);

    expect(chunk).not.toContain(CONSOLE_PROBE_MESSAGE);
    expect(chunk).not.toMatch(/\bdebugger\b/);
  });
});
