import { once } from "node:events";
import { type Server, type Socket, connect, createServer } from "node:net";
import { expect } from "@nuxvel/nuxt/testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { startSecondServer } from "./helpers/second-server";

function redisProxy(target: URL) {
  const sockets = new Set<Socket>();
  const server: Server = createServer((client) => {
    const upstream = connect(Number(target.port), target.hostname);

    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => socket.destroy());
    }
    client.pipe(upstream).pipe(client);
  });

  return {
    async listen() {
      server.listen(0, "127.0.0.1");
      await once(server, "listening");

      const address = server.address();
      return typeof address === "object" && address ? address.port : 0;
    },
    async stop() {
      const closed = once(server, "close");

      server.close();
      for (const socket of sockets) socket.destroy();
      await closed;
    },
  };
}

describe("auth with Redis stopped", () => {
  const email = "auth-redis-down@example.com";
  const password = "correct-horse-battery-staple";
  const redis = redisProxy(new URL(process.env.NUXT_REDIS_URL ?? ""));
  let server: Awaited<ReturnType<typeof startSecondServer>>;
  let cookie = "";

  function request(path: string, init: RequestInit = {}) {
    return fetch(new URL(path, server.url), { ...init, signal: AbortSignal.timeout(5_000) });
  }

  function signIn() {
    return request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: server.url.replace(/\/$/, "") },
      body: JSON.stringify({ email, password }),
    });
  }

  beforeAll(async () => {
    const redisUrl = new URL(process.env.NUXT_REDIS_URL ?? "");
    redisUrl.hostname = "127.0.0.1";
    redisUrl.port = String(await redis.listen());
    server = await startSecondServer({ env: { NUXT_REDIS_URL: redisUrl.href } });

    await request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: server.url.replace(/\/$/, "") },
      body: JSON.stringify({ name: "Redis Down", email, password }),
    });
    const signedIn = await signIn();

    expect(signedIn.status).toBe(200);
    cookie = signedIn.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");

    await redis.stop();
  }, 40_000);

  afterAll(() => server.stop());

  it("still reads the session, so a signed-in page renders signed in", async () => {
    const session = await request("/api/auth/get-session", { headers: { cookie } });

    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { email } });

    const page = await request("/", { headers: { cookie } });

    expect(page.status).toBe(200);
    expect(await page.text()).toContain(`Signed in as ${email}`);
  });

  it("refuses a sign-in with a 503 rather than letting it through unlimited", async () => {
    const response = await signIn();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      statusCode: 503,
      data: { code: "SERVICE_UNAVAILABLE", message: "Authentication is unavailable right now, try again in a moment" },
    });
  });
});
