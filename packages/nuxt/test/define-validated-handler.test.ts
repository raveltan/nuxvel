import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

function publish(path: string, body: unknown) {
  return guest().fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("defineValidatedHandler", async () => {
  await setupPlayground();

  it("hands the handler the parsed params, query and body", async () => {
    const response = await publish("/api/_validated/hello?draft=true", { title: "Hello" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slug: "hello", draft: true, title: "Hello", tags: [] });
  });

  it("answers a wrong body with 400 in the validation error shape", async () => {
    const response = await publish("/api/_validated/hello", { title: "" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      statusCode: 400,
      data: { code: "VALIDATION_ERROR", fields: { title: [expect.any(String)] } },
    });
  });

  it("answers a wrong route param and a wrong query with 400 too", async () => {
    const shortSlug = await publish("/api/_validated/hi", { title: "Hello" });
    const wrongQuery = await publish("/api/_validated/hello?draft=maybe", { title: "Hello" });

    expect(shortSlug.status).toBe(400);
    expect(await shortSlug.json()).toMatchObject({ data: { code: "VALIDATION_ERROR", fields: { slug: [expect.any(String)] } } });
    expect(wrongQuery.status).toBe(400);
    expect(await wrongQuery.json()).toMatchObject({ data: { code: "VALIDATION_ERROR", fields: { draft: [expect.any(String)] } } });
  });
});
