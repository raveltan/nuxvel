import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import superjson from "superjson";
import { setupPlayground } from "./helpers/playground";

describe("global tRPC errorFormatter (production)", async () => {
  await setupPlayground({
    env: { NODE_ENV: "production" },
  });

  it("strips the real message and stack trace from a plain thrown Error", async () => {
    const fetchError = await guest().$fetch("/api/trpc/_errorFormatterCheck.throwPlain").catch(
      (error) => error,
    );

    const shape = superjson.deserialize(fetchError.data.error);

    expect(shape.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(shape.message).not.toBe("boom detail");
    expect(shape.data.stack).toBeUndefined();
  });

  it("keeps an action's validation failure: 400, its message and data.fields", async () => {
    const fetchError = await guest().$fetch("/api/trpc/_errorFormatterCheck.actionInvalid").catch(
      (error) => error,
    );

    const shape = superjson.deserialize(fetchError.data.error);

    expect(fetchError.statusCode).toBe(400);
    expect(shape.data.code).toBe("BAD_REQUEST");
    expect(shape.message).toBe("Invalid input");
    expect(shape.data.fields).toEqual({ title: ["Title is required"] });
  });

  it("keeps an action's fail(): 422, its message and data.actionCode", async () => {
    const fetchError = await guest().$fetch("/api/trpc/_errorFormatterCheck.actionFailed").catch(
      (error) => error,
    );

    const shape = superjson.deserialize(fetchError.data.error);

    expect(fetchError.statusCode).toBe(422);
    expect(shape.data.code).toBe("UNPROCESSABLE_CONTENT");
    expect(shape.message).toBe("Refused on purpose");
    expect(shape.data.actionCode).toBe("check.refused");
  });

  it("keeps ForbiddenError (403) and UnauthenticatedError (401) with their messages", async () => {
    const forbidden = await guest().$fetch("/api/trpc/_errorFormatterCheck.forbidden").catch(
      (error) => error,
    );
    const unauthenticated = await guest().$fetch(
      "/api/trpc/_errorFormatterCheck.unauthenticated",
    ).catch((error) => error);

    expect(forbidden.statusCode).toBe(403);
    expect(superjson.deserialize(forbidden.data.error)).toMatchObject({
      message: "Not yours",
      data: { code: "FORBIDDEN" },
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(superjson.deserialize(unauthenticated.data.error)).toMatchObject({
      message: "Not signed in",
      data: { code: "UNAUTHORIZED" },
    });
  });
});
