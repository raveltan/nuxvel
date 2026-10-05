import { describe, it } from "vitest";

import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("actingAs() / guest()", async () => {
  await setupPlayground();

  it("returns results with their types, dates included", async () => {
    const { at } = await guest().trpc.health.now();

    expect(at).toBeInstanceOf(Date);
  });

  it("rejects with the error's code, actionCode and fields", async () => {
    const { trpc } = guest();

    await expect(trpc._errorFormatterCheck.actionFailed()).rejects.toBeActionError("check.refused");
    await expect(trpc._errorFormatterCheck.actionInvalid()).rejects.toHaveValidationErrors("title");
    await expect(trpc._errorFormatterCheck.inputInvalid({ title: "" })).rejects.toHaveValidationErrors("title");
    await expect(trpc._errorFormatterCheck.forbidden()).rejects.toBeTrpcError("FORBIDDEN");
  });

  it("keeps the field of a ConflictError for toHaveValidationErrors", async () => {
    await expect(guest().trpc._errorFormatterCheck.conflictField()).rejects.toHaveValidationErrors({
      slug: "Taken",
    });
  });

  it("refuses a procedure that does not exist", async () => {
    const { trpc } = guest();

    await expect(
      (trpc as unknown as { booking: { create(): Promise<unknown> } }).booking.create(),
    ).rejects.toThrow('No tRPC procedure at "booking.create"');
  });

  it("names a user id that does not exist", async () => {
    await expect(actingAs({ id: "missing" }).trpc.health.create({})).rejects.toThrow(
      'actingAs: no user has the id "missing"',
    );
  });
});
