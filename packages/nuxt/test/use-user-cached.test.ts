import { describe, it } from "vitest";
import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("useUser() on a cached route", async () => {
  await setupPlayground({ browser: true });

  it("shows the signed-in user after hydration, and the shared copy shows a guest", async () => {
    const user = await userFactory({ name: "Cached Reader", email: "cached-reader@example.com" });
    const client = actingAs(user);

    expect(await client.$fetch<string>("/_rendering/cached")).toContain("user:guest");

    const shared = await guest().$fetch<string>("/_rendering/cached");
    expect(shared).toContain("user:guest");
    expect(shared).not.toContain("Cached Reader");
    expect(shared).not.toContain("cached-reader@example.com");

    const page = await client.visit("/_rendering/cached");
    await page.getByText("user:Cached Reader").waitFor();
  });
});
