import { expect, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { CONSOLE_PROBE_MESSAGE } from "../helpers/console-probe";

describe("the dev client", () => {
  it("still logs from a page's console calls", async () => {
    const page = await visit("/_console-probe");
    const logged = (await page.consoleMessages()).find((message) => message.text() === CONSOLE_PROBE_MESSAGE);

    expect(logged?.type()).toBe("log");
  }, 60_000);
});
