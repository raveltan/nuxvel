import { actingAs, expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";
import { ActionError } from "../src/runtime/server/actions/action-error";
import { NotFoundError } from "../src/runtime/server/errors/taxonomy";

describe("error matchers", () => {
  it("toBeActionError passes only for an action error with that actionCode", () => {
    const bodyEmpty = new ActionError("post.body-empty", "Body cannot be empty");

    expect(bodyEmpty).toBeActionError("post.body-empty");
    expect(bodyEmpty).not.toBeActionError("post.locked");
    expect(new NotFoundError()).not.toBeActionError("NOT_FOUND");
  });

  it("toBeTrpcError matches the tRPC code, an action error included", () => {
    expect(new NotFoundError()).toBeTrpcError("NOT_FOUND");
    expect(new ActionError("post.body-empty", "Body cannot be empty")).toBeTrpcError(
      "UNPROCESSABLE_CONTENT",
    );
    expect({ code: "post.body-empty" }).not.toBeTrpcError("UNPROCESSABLE_CONTENT");
  });

  describe("toHaveValidationErrors", async () => {
    await setupPlayground();

    const error = { code: "VALIDATION_ERROR", fields: { title: ["Too small"], due: ["Required"] } };

    it("checks a message by string, RegExp or asymmetric matcher", () => {
      expect(error).toHaveValidationErrors({ title: "Too small", due: expect.any(String) });
      expect(error).toHaveValidationErrors({ title: /small/ });
      expect(error).toHaveValidationErrors("title", "due");
    });

    it("matches a CONFLICT with a field", () => {
      expect({ code: "CONFLICT", fields: { slug: ["Taken"] } }).toHaveValidationErrors({ slug: "Taken" });
    });

    it("fails with the expected and received message of a field", () => {
      expect(error).not.toHaveValidationErrors({ title: "Required" });
      expect(error).not.toHaveValidationErrors({ title: /big/ });
      expect(() => expect(error).toHaveValidationErrors({ title: /big/ })).toThrow(
        /field title: expected message \/big\/, received [\s\S]*Too small/,
      );
    });

    it("unwraps the FetchError of a REST 400", async () => {
      const user = await userFactory();

      await expect(
        actingAs(user).$fetch("/api/v1/posts", { method: "POST", body: { title: "", body: "" } }),
      ).rejects.toHaveValidationErrors("title");
    });
  });
});
