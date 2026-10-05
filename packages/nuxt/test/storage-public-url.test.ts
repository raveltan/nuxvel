import { expect } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished } from "vitest";
import { TEST_STORAGE_URL } from "@nuxvel/test-helpers/services";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { ensureBucket, putObject, storedObjectSize } from "./helpers/storage";
import { startSecondServer } from "./helpers/second-server";
import { TEST_STORAGE_BUCKET } from "./setup/constants";

const internal = new URL(TEST_STORAGE_URL);
const publicUrl = `http://127.0.0.1:${internal.port}`;

describe("NUXT_STORAGE_PUBLIC_URL", () => {
  it("signs read and upload URLs for the public storage host, which storage accepts", { timeout: 60_000 }, async () => {
    expect(internal.hostname).not.toBe("127.0.0.1");
    await ensureBucket(TEST_STORAGE_BUCKET);
    await putObject(TEST_STORAGE_BUCKET, "public-url/hello.txt", Buffer.from("hello"), "text/plain");
    const server = await startSecondServer({ env: { NUXT_STORAGE_PUBLIC_URL: publicUrl } });
    onTestFinished(() => server.stop());

    const { url } = await (await fetch(new URL("/api/_signed-read-url-check?key=public-url/hello.txt", server.url))).json();
    expect(url.startsWith(`${publicUrl}/${TEST_STORAGE_BUCKET}/public-url/hello.txt?`)).toBe(true);
    expect(await (await fetch(url)).text()).toBe("hello");

    const password = "correct-horse-battery-staple";
    const user = await userFactory.withPassword(password)({ email: "public-url@example.com" });
    const signIn = await fetch(new URL("/api/auth/sign-in/email", server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password }),
    });
    const cookie = signIn.headers.getSetCookie().find((candidate) => candidate.includes("session_token"))?.split(";")[0] ?? "";
    const body = Buffer.concat([
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
      Buffer.alloc(186),
    ]);
    const presigned = await (
      await fetch(new URL("/api/uploads/profile-avatar", server.url), {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ type: "image/png", size: body.byteLength }),
      })
    ).json();
    expect(presigned.url.startsWith(`${publicUrl}/${TEST_STORAGE_BUCKET}/tmp/profile-avatar/`)).toBe(true);
    expect((await fetch(presigned.url, { method: "PUT", headers: presigned.headers, body })).status).toBe(200);
    expect(await storedObjectSize(TEST_STORAGE_BUCKET, presigned.key)).toBe(body.byteLength);
  });
});
