import { defineComponent, h } from "vue";
import { describe, expect, it } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { createPostInput } from "../../../playground/shared/schemas/post";
import { useFormErrors, useTRPC } from "#imports";

function answerCreatePost(error: { message: string; code: string; httpStatus: number; fields?: Record<string, string[]> }) {
  registerEndpoint("/api/trpc/post.create", {
    method: "POST",
    handler: () => [
      {
        error: {
          json: {
            message: error.message,
            code: -32600,
            data: { code: error.code, httpStatus: error.httpStatus, ...(error.fields ? { fields: error.fields } : {}) },
          },
        },
      },
    ],
  });
}

const PlainPostForm = defineComponent({
  setup() {
    const trpc = useTRPC();
    const errors = useFormErrors();

    async function save(title: string) {
      errors.clear();

      const parsed = createPostInput.safeParse({ title, body: "" });

      if (!parsed.success) return errors.set(parsed.error);

      try {
        await trpc.post.create.mutate(parsed.data);
      } catch (error) {
        errors.set(error);
      }
    }

    return () =>
      h("form", [
        h("p", { id: "title-errors" }, errors.fields.title?.join(" ") ?? ""),
        h("p", { id: "form-error" }, errors.formError ?? ""),
        h("button", { id: "save-empty", type: "button", onClick: () => save("") }),
        h("button", { id: "save", type: "button", onClick: () => save("Hello") }),
      ]);
  },
});

async function click(wrapper: Awaited<ReturnType<typeof mountSuspended>>, id: string) {
  await wrapper.find(`#${id}`).trigger("click");
  await expect.poll(() => wrapper.find("#title-errors").text() + wrapper.find("#form-error").text()).not.toBe("");
}

describe("useFormErrors()", () => {
  it("shows a schema failure under its field", async () => {
    const wrapper = await mountSuspended(PlainPostForm);

    await click(wrapper, "save-empty");

    expect(wrapper.find("#title-errors").text()).toMatch(/>=1 characters/);
    expect(wrapper.find("#form-error").text()).toBe("");
  });

  it("shows the server's field errors under their field", async () => {
    answerCreatePost({ message: "Invalid input", code: "BAD_REQUEST", httpStatus: 400, fields: { title: ["Title already taken"] } });
    const wrapper = await mountSuspended(PlainPostForm);

    await click(wrapper, "save");

    expect(wrapper.find("#title-errors").text()).toBe("Title already taken");
    expect(wrapper.find("#form-error").text()).toBe("");
  });

  it("puts an error without fields in formError", async () => {
    answerCreatePost({ message: "Posting is closed", code: "FORBIDDEN", httpStatus: 403 });
    const wrapper = await mountSuspended(PlainPostForm);

    await click(wrapper, "save");

    expect(wrapper.find("#title-errors").text()).toBe("");
    expect(wrapper.find("#form-error").text()).toBe("Posting is closed");
  });
});
