import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { getRequestHeader } from "h3";
import { createPostInput } from "../../../playground/shared/schemas/post";
import { $api, useActionForm } from "#imports";

async function mountCreatePostForm(onSuccess: (post: unknown) => void) {
  let form: ReturnType<typeof createForm> | undefined;

  function createForm() {
    return useActionForm(
      createPostInput,
      $api.post.create.mutationOptions(),
      { defaults: { title: "", body: "" }, onSuccess },
    );
  }

  await mountSuspended(
    defineComponent({
      setup() {
        form = createForm();
        return () => h("div");
      },
    }),
  );

  if (!form) throw new Error("the form component did not mount");

  return form;
}

describe("useActionForm()", () => {
  it("fills field errors from the schema without calling the server", async () => {
    const create = vi.fn(() => ({ result: { data: { json: { id: 1 } } } }));
    registerEndpoint("/api/trpc/post.create", {
      method: "POST",
      handler: create,
    });
    const onSuccess = vi.fn();
    const form = await mountCreatePostForm(onSuccess);

    await form.submit();

    expect(Object.keys(form.errors)).toEqual(["title"]);
    expect(form.errors.title).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("runs the mutation with valid input and clears old errors", async () => {
    const create = vi.fn(() => ({ result: { data: { json: { id: 7, title: "Hello" } } } }));
    registerEndpoint("/api/trpc/post.create", {
      method: "POST",
      handler: create,
    });
    const onSuccess = vi.fn();
    const form = await mountCreatePostForm(onSuccess);

    await form.submit();
    form.state.title = "Hello";
    await form.submit();

    expect(form.errors).toEqual({});
    expect(create).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ id: 7, title: "Hello" });
  });

  it("sends one idempotency key with every submit, and ignores a submit while one runs", async () => {
    const keys: (string | undefined)[] = [];
    registerEndpoint("/api/trpc/post.create", {
      method: "POST",
      handler: (event) => {
        keys.push(getRequestHeader(event, "idempotency-key"));
        return { result: { data: { json: { id: 7, title: "Hello" } } } };
      },
    });
    const form = await mountCreatePostForm(() => {});

    form.state.title = "Hello";
    await Promise.all([form.submit(), form.submit()]);
    await form.submit();

    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("puts a failed mutation's message in formError", async () => {
    registerEndpoint("/api/trpc/post.create", {
      method: "POST",
      handler: () => ({
        error: {
          json: {
            message: "Title already taken",
            code: -32009,
            data: { code: "CONFLICT", httpStatus: 409 },
          },
        },
      }),
    });
    const form = await mountCreatePostForm(() => {});

    form.state.title = "Hello";
    await form.submit();

    expect(form.formError).toBe("Title already taken");
  });

  it("fills errors from the server's field errors", async () => {
    registerEndpoint("/api/trpc/post.create", {
      method: "POST",
      handler: () => ({
        error: {
          json: {
            message: "A row with this value already exists",
            code: -32009,
            data: {
              code: "CONFLICT",
              httpStatus: 409,
              fields: { title: ["A row with this value already exists"] },
            },
          },
        },
      }),
    });
    const form = await mountCreatePostForm(() => {});

    form.state.title = "Hello";
    await form.submit();

    expect(form.errors).toEqual({ title: ["A row with this value already exists"] });
    expect(form.formError).toBeUndefined();
  });

  it("puts a server field message that no form field shows in formError, once", async () => {
    registerEndpoint("/api/trpc/post.create", {
      method: "POST",
      handler: () => ({
        error: {
          json: {
            message: "Invalid input",
            code: -32009,
            data: {
              code: "CONFLICT",
              httpStatus: 409,
              fields: { title: ["Title taken"], key: ["Upload expired"] },
            },
          },
        },
      }),
    });
    const form = await mountCreatePostForm(() => {});

    form.state.title = "Hello";
    await form.submit();

    expect(form.errors).toEqual({ title: ["Title taken"] });
    expect(form.formError).toBe("Upload expired");
  });

  it("sends the state unparsed, so a transforming schema is parsed once on the server", async () => {
    const tagsSchema = z.object({
      tags: z.string().min(1).transform((tags) => tags.split(",")),
    });
    const mutation = vi.fn(async (input: z.input<typeof tagsSchema>) => input);
    let form: ReturnType<typeof createForm> | undefined;

    function createForm() {
      return useActionForm(tagsSchema, { mutation }, { defaults: { tags: "news,tech" } });
    }

    await mountSuspended(
      defineComponent({
        setup() {
          form = createForm();
          return () => h("div");
        },
      }),
    );

    if (!form) throw new Error("the form component did not mount");

    await form.submit();

    expect(mutation.mock.calls[0]?.[0]).toEqual({ tags: "news,tech" });
  });
});
