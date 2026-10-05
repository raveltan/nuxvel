import postgres from "postgres";
import { actingAs, expect, guest, signIn } from "@nuxvel/nuxt/testing";
import { afterEach, describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { userFactory } from "../../../playground/server/factories/users.factory";
import {
  closeChannelStreams,
  openChannelStream,
} from "./helpers/channel-stream";
import { setupPlayground } from "./helpers/playground";
import { sessionCookie } from "./helpers/session-cookie";

const PASSWORD = "correct-horse-battery-staple";

async function setRole(email: string, role: string) {
  const sql = postgres(process.env.NUXT_DATABASE_URL ?? "", { max: 1 });

  try {
    await sql`update "user" set role = ${role} where email = ${email}`;
  } finally {
    await sql.end();
  }
}

describe("channel reconnect authorization", async () => {
  await setupPlayground();

  afterEach(() => closeChannelStreams());

  it("ends the streams of a session that signs out, and only those", async () => {
    const user = await userFactory.withPassword(PASSWORD)({ email: "sign-out@example.com" });
    const signingOut = actingAs(user);
    const staying = await signIn(user.email, PASSWORD);
    const closing = await openChannelStream("_probe-members", { cookie: await sessionCookie(signingOut) });
    const open = await openChannelStream("_probe-members", { cookie: await sessionCookie(staying) });

    expect(await closing.next()).toEqual({ event: "connected", data: "{}" });
    expect(await open.next()).toEqual({ event: "connected", data: "{}" });

    const signOut = await signingOut.fetch("/api/auth/sign-out", {
      method: "POST",
      headers: {
        origin: new URL(url("/")).origin,
        "content-type": "application/json",
      },
      body: "{}",
    });

    expect(signOut.status).toBe(200);
    expect(await closing.next()).toBe("ended");
    expect(await open.next(300)).toBe("timeout");
  });

  it("rejects a reconnect once access is revoked, with nothing replayed", async () => {
    const email = "reconnect-admin@example.com";
    const cookie = await sessionCookie(actingAs(await userFactory({ email })));

    await setRole(email, "admin");

    const first = await openChannelStream("_probe-admins", { cookie });

    expect(await first.next()).toEqual({ event: "connected", data: "{}" });

    await guest().$fetch("/api/_broadcast-check", {
      method: "POST",
      body: { channel: "_probe-admins", event: "seen", payload: null },
    });

    const seen = await first.next();

    first.close();
    await setRole(email, "user");
    await guest().$fetch("/api/_broadcast-check", {
      method: "POST",
      body: { channel: "_probe-admins", event: "missed", payload: null },
    });

    const reconnect = await openChannelStream("_probe-admins", {
      cookie,
      "last-event-id": seen?.id ?? "",
    });

    expect(reconnect.response.status).toBe(403);
    expect(await reconnect.response.json()).toMatchObject({
      statusCode: 403,
      data: { code: "FORBIDDEN", message: 'Not allowed to listen to channel "_probe-admins"' },
    });
  });
});
