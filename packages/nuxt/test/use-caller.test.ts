import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("useCaller", async () => {
  await setupPlayground();

  it("lets a plain function call a procedure outside an HTTP request", async () => {
    const body = await guest().$fetch("/api/_use-caller-check");
    expect(body.ping).toBe("pong");
  });

  it("runs an authed procedure as the user of the request it is called in", async () => {
    const email = "use-caller-session@example.com";
    const user = await userFactory({ email });

    const body = await actingAs(user).$fetch("/api/_use-caller-check");

    expect(body.me).toMatchObject({ email });
  });
});
