import { defineComponent, h } from "vue";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { getRequestHeader, readBody } from "h3";
import { $api, useActionForm } from "#imports";

async function mounted<T>(setup: () => T) {
  let result: T | undefined;
  const wrapper = await mountSuspended(
    defineComponent({
      setup() {
        result = setup();
        return () => h("div");
      },
    }),
  );
  onTestFinished(() => wrapper.unmount());
  if (!result) throw new Error("the form component did not mount");
  return result;
}

function mountCreatePostForm(onSuccess: (post: unknown) => void, failures?: { "post.body-empty": "title" }) {
  return mounted(() => useActionForm($api.post.create, { defaults: { title: "", body: "" }, onSuccess, failures }));
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

  it("puts an action failure under the field the server names, or the one failures maps it to", async () => {
    registerEndpoint("/api/trpc/post.create", {
      method: "POST",
      handler: () => ({
        error: {
          json: {
            message: "Body cannot be empty after trimming",
            code: -32022,
            data: {
              code: "UNPROCESSABLE_CONTENT",
              httpStatus: 422,
              actionCode: "post.body-empty",
              fields: { body: ["Body cannot be empty after trimming"] },
            },
          },
        },
      }),
    });
    const serverMapped = await mountCreatePostForm(() => {});
    const clientMapped = await mountCreatePostForm(() => {}, { "post.body-empty": "title" });

    serverMapped.state.title = "Hello";
    clientMapped.state.title = "Hello";
    await serverMapped.submit();
    await clientMapped.submit();

    expect(serverMapped.errors).toEqual({ body: ["Body cannot be empty after trimming"] });
    expect(clientMapped.errors).toEqual({ title: ["Body cannot be empty after trimming"] });
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

  it("takes the procedure's schema from shared/schemas/, keeps only its keys of defaults, and starts a missing key at its .default() or undefined", async () => {
    const row = { id: 3, title: "Hello", status: undefined, createdAt: new Date() };
    const form = await mounted(() => useActionForm($api._formCheck.save, { defaults: row }));

    expect(Object.entries(form.state)).toEqual([
      ["title", "Hello"],
      ["status", "draft"],
      ["note", undefined],
    ]);

    await form.submit();

    expect(Object.keys(form.errors)).toEqual(["note"]);
  });

  it("starts the state of a schema that is not an object as undefined, and submits what the user sets", async () => {
    const bodies: unknown[] = [];
    registerEndpoint("/api/trpc/health.echo", {
      method: "POST",
      handler: async (event) => {
        bodies.push(await readBody(event));
        return { result: { data: { json: "hi" } } };
      },
    });
    const form = await mounted(() => useActionForm($api.health.echo, { schema: z.string().min(1) }));

    expect(form.state).toBeUndefined();

    form.state = "hi";
    await form.submit();

    expect(bodies).toEqual([{ json: "hi" }]);
  });

  it("checks the state with the schema option, and sends the state unparsed, so a transforming schema is parsed once on the server", async () => {
    const bodies: unknown[] = [];
    registerEndpoint("/api/trpc/post.create", {
      method: "POST",
      handler: async (event) => {
        bodies.push(await readBody(event));
        return { result: { data: { json: { id: 7, title: "Hello" } } } };
      },
    });
    const form = await mounted(() =>
      useActionForm($api.post.create, {
        schema: z.object({ title: z.string().min(3).transform((title) => title.toUpperCase()), body: z.string() }),
        defaults: { title: "Hi", body: "" },
      }),
    );

    await form.submit();
    form.state.title = "Hello";
    await form.submit();

    expect(bodies).toEqual([{ json: { title: "Hello", body: "" } }]);
  });
});
