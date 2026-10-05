import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

const FROM_ANOTHER_MACHINE = { "x-forwarded-for": "203.0.113.5" };

describe("the queue dashboard", () => {
  it("serves the dashboard to this machine without signing in", async () => {
    const response = await guest().fetch("/_nuxvel/queue");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>Bull Dashboard</title>");
  });

  it("refuses another machine, whatever it sends", async () => {
    const page = await guest().fetch("/_nuxvel/queue?secret=anything", { headers: FROM_ANOTHER_MACHINE });
    const api = await guest().fetch("/_nuxvel/queue/api/queues", {
      headers: { ...FROM_ANOTHER_MACHINE, cookie: "nuxvel_devtools=anything" },
    });

    expect(page.status).toBe(403);
    expect(api.status).toBe(403);
  });
});
