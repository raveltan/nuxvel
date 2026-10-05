import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../../playground/server/factories/users.factory";
import { setupPlayground } from "../helpers/playground";

describe("userFactory.withPassword()", async () => {
  await setupPlayground();

  it("writes the credential account, so the user signs in with that password", async () => {
    const users = await userFactory.withPassword("secret-password").count(2)();
    const signIn = (email: string, password: string) =>
      guest().fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

    for (const user of users) expect((await signIn(user.email, "secret-password")).status).toBe(200);

    expect((await signIn(users[0]?.email ?? "", "wrong-password")).status).toBe(401);
  });
});
