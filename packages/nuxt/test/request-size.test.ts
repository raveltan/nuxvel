import { once } from "node:events";
import { type IncomingMessage, request } from "node:http";
import { url } from "@nuxt/test-utils/e2e";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

async function statusOfOpenBody(method: string, path: string, headers: Record<string, string> = {}) {
  const outgoing = request(url(path), { method, headers: { "content-type": "application/json", ...headers } });
  outgoing.on("error", () => {});
  outgoing.write(Buffer.alloc(64 * 1024, "a"));
  const [response] = (await once(outgoing, "response")) as [IncomingMessage];
  outgoing.destroy();

  return response.statusCode;
}

async function statusOf(method: string, path: string, body: string) {
  const outgoing = request(url(path), {
    method,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
  });
  outgoing.end(body);
  const [response] = (await once(outgoing, "response")) as [IncomingMessage];
  response.resume();

  return response.statusCode;
}

describe("request size", async () => {
  await setupPlayground();

  it("refuses a chunked POST to a tRPC procedure before it reads the body", async () => {
    expect(await statusOfOpenBody("POST", "/api/trpc/post.create")).toBe(411);
  });

  it("refuses a chunked POST to Better Auth before it reads the body", async () => {
    expect(await statusOfOpenBody("POST", "/api/auth/sign-in/email")).toBe(411);
  });

  it("refuses a PATCH whose Content-Length is over the limit before it reads the body", async () => {
    expect(await statusOfOpenBody("PATCH", "/api/v1/posts", { "content-length": "3000000" })).toBe(413);
  });

  it("lets a small POST with Content-Length through", async () => {
    expect(await statusOf("POST", "/api/trpc/post.create", "{}")).toBe(401);
  });
});
