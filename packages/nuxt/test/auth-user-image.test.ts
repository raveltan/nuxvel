import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postJson, sessionCookie } from "./helpers/auth-flows";
import { setupPlayground } from "./helpers/playground";

const PASSWORD = "correct-horse-battery-staple";
const ARCHIVE_KEY = "backups/audit/x.jsonl.gz";

describe("user.image input", async () => {
  await setupPlayground();

  it("refuses an image on sign-up", async () => {
    const refused = await postJson("/api/auth/sign-up/email", {
      name: "Eve",
      email: "image-sign-up@example.com",
      password: PASSWORD,
      image: ARCHIVE_KEY,
    });

    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: "IMAGE_NOT_ACCEPTED" });
  });

  it("refuses an image on update-user, so profile.me signs nothing", async () => {
    const cookie =
      sessionCookie(await postJson("/api/auth/sign-up/email", { name: "Eve", email: "image-update@example.com", password: PASSWORD })) ??
      "";

    const refused = await postJson("/api/auth/update-user", { image: ARCHIVE_KEY }, { cookie });

    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: "IMAGE_NOT_ACCEPTED" });

    const me = await guest().fetch("/api/trpc/profile.me", { headers: { cookie } });
    const body: { result: { data: { json: { avatarUrl: string | null } } } } = await me.json();

    expect(body.result.data.json.avatarUrl).toBeNull();
    expect((await postJson("/api/auth/update-user", { name: "Eve Two" }, { cookie })).status).toBe(200);
    expect((await postJson("/api/auth/update-user", { image: null }, { cookie })).status).toBe(200);
  });
});
