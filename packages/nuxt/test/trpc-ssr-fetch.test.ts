import { expect, guest, text, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { url } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

describe("tRPC during SSR", async () => {
  await setupPlayground({ browser: true });

  it("calls procedures in-process with the visitor's request headers", async () => {
    const page = await visit("/_trpc-ssr", { extraHTTPHeaders: { "x-request-id": "trpc-ssr-request-id" } });

    await expect(text(page, "request-id:trpc-ssr-request-id")).toBeVisible();
  });

  it("renders a page that reaches the API through $api in its script and its template", async () => {
    const page = await visit("/_api", { extraHTTPHeaders: { "x-request-id": "api-request-id" } });

    await expect(text(page, "api-request-id:api-request-id")).toBeVisible();
    await expect(text(page, "api-key:trpc.post.byId")).toBeVisible();
  });

  it("renders the error state of a query with ssrCatchError, and keeps the tRPC error in the payload", async () => {
    const page = await visit("/_trpc-ssr-error");

    await expect(text(page, "caught:taxonomy check")).toBeVisible();
  });

  it("renders the error state with HTTP 404 when a query fails with NOT_FOUND", async () => {
    const response = await guest().fetch(url("/_trpc-ssr-default?name=NotFoundError"));

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("caught:taxonomy check");
  });

  it("still answers with the error page when a query fails with another error", async () => {
    const response = await guest().fetch(url("/_trpc-ssr-default?name=UnknownError"));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("caught:");
  });

  it.for([
    ["ForbiddenError", 403],
    ["UnauthenticatedError", 401],
  ] as const)("renders the error state with the HTTP status of %s", async ([name, status]) => {
    const response = await guest().fetch(url(`/_trpc-ssr-forbidden?names=${name}`));

    expect(response.status).toBe(status);
    expect(await response.text()).toContain("caught:taxonomy check");
  });

  it("gives the page the status of the first error code", async () => {
    const response = await guest().fetch(url("/_trpc-ssr-forbidden?names=UnauthenticatedError,ForbiddenError"));

    expect(response.status).toBe(401);
  });

  it("answers with the error page when a forbidden query shares the page with another error", async () => {
    const response = await guest().fetch(url("/_trpc-ssr-forbidden?names=ForbiddenError,UnknownError"));

    expect(response.status).toBe(500);
  });
});
