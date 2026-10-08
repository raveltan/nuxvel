import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { mountSuspended, registerEndpoint } from "@nuxt/test-utils/runtime";
import { useQueryCache } from "@pinia/colada";
import { useNuxtApp } from "#imports";
import { $api } from "@nuxvel/nuxt/app/api";
import { useActionForm } from "@nuxvel/nuxt/app/forms";

async function mounted<T>(setup: () => T) {
  let result: T | undefined;
  const wrapper = await mountSuspended(
    defineComponent({
      setup() {
        result = setup();
        return () => h("p");
      },
    }),
  );
  onTestFinished(() => wrapper.unmount());
  if (!result) throw new Error("the component did not mount");
  return result;
}

function mutationUi() {
  const ui = useNuxtApp().$nuxvelMutationUi;
  if (!ui) throw new Error("the playground has Nuxt UI");
  return ui;
}

describe("the options of .useMutation()", () => {
  beforeEach(() => {
    const queryCache = useQueryCache();
    queryCache.getEntries().forEach((entry) => queryCache.remove(entry));
    registerEndpoint("/api/trpc/health.echo", { method: "POST", handler: () => ({ result: { data: { json: "hello" } } }) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs nuxvel's patch, toast and invalidation before the app's hooks, and takes toast props or a function", async () => {
    const queryCache = useQueryCache();
    queryCache.setQueryData($api.health.ping.key(), "pong");
    const calls: unknown[] = [];
    vi.spyOn(mutationUi(), "toast").mockImplementation((toast) => calls.push(toast));
    vi.spyOn(queryCache, "invalidateQueries").mockImplementation(async () => {
      calls.push("invalidate");
    });
    const [echo, withProps] = await mounted(() => [
      $api.health.echo.useMutation({
        invalidate: false,
        optimistic: { key: () => $api.health.ping.key(), apply: (_current, text) => text },
        toast: (result) => ({ title: result, description: "Sent" }),
        onMutate: () => calls.push(`onMutate sees ${queryCache.getQueryData($api.health.ping.key())}`),
        onSuccess: () => calls.push("onSuccess"),
        onSettled: () => calls.push("onSettled"),
      }),
      $api.health.echo.useMutation({ invalidate: false, toast: { title: "Done", color: "info" } }),
    ]);

    await echo.mutateAsync("optimistic");
    await withProps.mutateAsync("hello");

    expect(calls).toEqual([
      "onMutate sees optimistic",
      { color: "success", title: "hello", description: "Sent" },
      "onSuccess",
      "invalidate",
      "onSettled",
      { color: "info", title: "Done" },
    ]);
  });

  it("rolls the patch back when the app's onMutate throws", async () => {
    const queryCache = useQueryCache();
    queryCache.setQueryData($api.health.ping.key(), "pong");
    const echo = await mounted(() =>
      $api.health.echo.useMutation({
        optimistic: { key: () => $api.health.ping.key(), apply: (_current, text) => text },
        onMutate: () => {
          throw new Error("boom");
        },
      }),
    );

    await expect(echo.mutateAsync("optimistic")).rejects.toThrow("boom");

    expect(queryCache.getQueryData($api.health.ping.key())).toBe("pong");
  });

  it("does not submit useActionForm() when the confirm dialog is cancelled", async () => {
    vi.spyOn(mutationUi(), "confirm").mockResolvedValue(false);
    const onSuccess = vi.fn();
    const form = await mounted(() =>
      useActionForm($api.post.create, { confirm: { title: "Create post?" }, defaults: { title: "Hello", body: "" }, onSuccess }),
    );

    await form.submit();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(form.formError).toBeUndefined();
    expect(form.pending).toBe(false);
  });

  it("passes the toast and invalidate options of useActionForm() to the mutation", async () => {
    registerEndpoint("/api/trpc/post.create", { method: "POST", handler: () => ({ result: { data: { json: { id: 7, title: "Hello" } } } }) });
    const toast = vi.spyOn(mutationUi(), "toast").mockImplementation(() => {});
    const invalidate = vi.spyOn(useQueryCache(), "invalidateQueries");
    const form = await mounted(() =>
      useActionForm($api.post.create, { toast: (post) => `Created ${post.title}`, invalidate: ["tag"], defaults: { title: "Hello", body: "" } }),
    );

    await form.submit();

    expect(toast).toHaveBeenCalledWith({ color: "success", title: "Created Hello" });
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(invalidate.mock.calls.map(([filters]) => filters?.key)).toEqual([["trpc", "tag"]]);
  });

  it("keeps status and error as they were after a cancel", async () => {
    vi.spyOn(mutationUi(), "confirm").mockResolvedValue(false);
    const echo = await mounted(() => $api.health.echo.useMutation({ confirm: { title: "Send?" } }));

    await expect(echo.mutateAsync("hello")).rejects.toThrow("cancelled");

    expect([echo.status, echo.error, echo.asyncStatus]).toEqual(["pending", null, "idle"]);
  });
});
