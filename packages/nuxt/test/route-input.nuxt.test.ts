import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { z } from "zod";
import { useRouter } from "#imports";
import { useRouteInput } from "@nuxvel/nuxt/app/ui";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().optional(),
});

async function routeInputAt<T>(path: string, read: () => T): Promise<T>;
async function routeInputAt(path: string): Promise<ReturnType<typeof readInput>>;
async function routeInputAt(path: string, read: () => unknown = readInput) {
  let input: unknown;
  await mountSuspended(
    defineComponent({
      setup() {
        input = read();
        return () => h("div");
      },
    }),
    { route: path },
  );

  return input;
}

function readInput() {
  return useRouteInput({ query: querySchema, params: z.object({ id: z.coerce.number().default(0) }) });
}

describe("useRouteInput", () => {
  it.for([
    { path: "/?page=3&search=nuxt", query: { page: 3, search: "nuxt" } },
    { path: "/", query: { page: 1 } },
    { path: "/?page=abc&search=nuxt", query: { page: 1, search: "nuxt" } },
    { path: "/?page=0&search=a&search=b", query: { page: 1 } },
  ])("parses $path to the schema and falls back to the default of each invalid key", async ({ path, query }) => {
    const input = await routeInputAt(path);

    expect(input.query.value).toEqual(query);
  });

  it("falls back to the defaults as a whole when an object-level refine fails", async () => {
    const rangeSchema = z
      .object({ from: z.coerce.number().default(1), to: z.coerce.number().default(9) })
      .refine((range) => range.from <= range.to);

    const input = await routeInputAt("/?from=5&to=2", () => useRouteInput({ query: rangeSchema }));

    expect(input.query.value).toEqual({ from: 1, to: 9 });
  });

  it("parses the params of the route", async () => {
    const input = await routeInputAt("/posts/42");

    expect(input.params.value).toEqual({ id: 42 });
  });

  it("follows the route", async () => {
    const input = await routeInputAt("/?page=2");

    await useRouter().push("/?page=5");
    await nextTick();

    expect(input.query.value).toEqual({ page: 5 });
  });
});
