import { describe, it } from "vitest";
import { actingAs, expect, guest, startMaintenance, stopMaintenance } from "@nuxvel/nuxt/testing";
import { postFactory } from "../../../playground/server/factories/posts.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("REST API", async () => {
  await setupPlayground();

  it("serves a procedure with openapi meta as plain JSON", async () => {
    const post = await postFactory({ title: "Wombat over REST" });

    const list = await guest().fetch("/api/v1/posts?q=wombat&perPage=5");
    const one = await guest().fetch(`/api/v1/posts/${post.id}`);

    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      rows: [expect.objectContaining({ id: post.id, title: "Wombat over REST" })],
      page: 1,
      perPage: 5,
      total: 1,
      lastPage: 1,
    });
    expect(one.status).toBe(200);
    expect(await one.json()).toMatchObject({ id: post.id, title: "Wombat over REST", createdAt: post.createdAt.toISOString() });
  });

  it("reads the JSON body of a POST", async () => {
    const { key } = await actingAs(await userFactory()).api.apiKeys.create({ name: "ci" });

    const response = await guest().fetch("/api/v1/posts", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ title: "Posted over REST", body: "Hello" }),
    });

    expect(await response.json()).toMatchObject({ title: "Posted over REST" });
    expect(response.status).toBe(200);
  });

  it("answers a missing row with 404 and the tRPC code", async () => {
    const response = await guest().fetch("/api/v1/posts/999999");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND", data: { httpStatus: 404 } });
  });

  it("answers invalid input with 400 and the fields that failed", async () => {
    const response = await guest().fetch("/api/v1/posts/-1");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Input validation failed", code: "BAD_REQUEST", data: { fields: { id: [expect.any(String)] } } });
  });

  it("answers a path no procedure exposes with 404", async () => {
    const response = await guest().fetch("/api/v1/nothing-here");

    expect(response.status).toBe(404);
  });

  it("answers 503 with the maintenance shape while the app is in maintenance mode", async () => {
    await startMaintenance({ message: "Back soon", retryAfter: 60 });

    try {
      const response = await guest().fetch("/api/v1/posts");

      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("60");
      expect(await response.json()).toMatchObject({ data: { code: "MAINTENANCE", message: "Back soon", retryAfter: 60 } });
    } finally {
      await stopMaintenance();
    }
  });

  it("serves an OpenAPI 3.1 document that lists the exposed operations", async () => {
    const response = await guest().fetch("/api/v1/openapi.json");
    const document = await response.json();

    expect(response.status).toBe(200);
    expect(document).toMatchObject({
      openapi: expect.stringMatching(/^3\.1\./),
      info: { title: "nuxvel playground", version: "1.0.0" },
      servers: [{ url: "/api/v1" }],
    });
    expect(document.paths["/posts"].get).toMatchObject({ operationId: "post-list", summary: "List posts", tags: ["posts"] });
    expect(document.paths["/posts"].get.responses[200].content["application/json"].schema).toMatchObject({
      type: "object",
      properties: {
        rows: { type: "array", items: { type: "object", properties: { title: { type: "string" } } } },
        page: { type: "integer" },
        perPage: { type: "integer" },
        total: { type: "integer" },
        lastPage: { type: "integer" },
      },
      required: ["rows", "page", "perPage", "total", "lastPage"],
    });
    expect(document.paths["/posts/{id}"].get).toMatchObject({
      operationId: "post-byId",
      parameters: [expect.objectContaining({ name: "id", in: "path", required: true })],
      responses: { 200: expect.objectContaining({ content: { "application/json": expect.anything() } }) },
    });
    expect(document.paths["/me"].get.security).toEqual([{ apiKey: [] }]);
    expect(document.paths["/posts"].get.security).toBeUndefined();
    expect(document.components.securitySchemes.apiKey).toMatchObject({ type: "http", scheme: "bearer" });
    expect(Object.keys(document.paths)).not.toContain("/health/ping");
  });

  it("serves the API reference page with a CSP that allows only its pinned script", async () => {
    const response = await guest().fetch("/api/v1/docs");
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-url="/api/v1/openapi.json"');
    expect(csp).toContain("default-src 'none'; script-src https://cdn.jsdelivr.net/npm/@scalar/api-reference@");
    expect(csp).toContain("style-src 'unsafe-inline'; connect-src 'self'");
  });
});
