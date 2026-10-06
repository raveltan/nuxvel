import { useNuxtApp } from "#app";
import type { AppTRPC } from "./app-trpc";
import { PROCEDURE_PATH } from "./options-proxy";

function childOf(node: unknown, segment: string): unknown {
  return (typeof node === "object" || typeof node === "function") && node !== null
    ? Reflect.get(node, segment)
    : undefined;
}

function apiPath(path: string[]): unknown {
  return new Proxy(() => {}, {
    get: (_target, prop) => {
      if (prop === "__v_skip") return true;
      if (prop === PROCEDURE_PATH) return path.join(".");
      if (typeof prop !== "string" || prop === "then" || prop === "toJSON" || prop.startsWith("__v_")) return undefined;
      return apiPath([...path, prop]);
    },
    apply: (_target, _this, args: unknown[]) => {
      const target = path.reduce<unknown>(childOf, useNuxtApp().$trpc);

      if (typeof target !== "function") throw new TypeError(`$api has no procedure call "${path.join(".")}"`);

      return target(...args);
    },
  });
}

/**
 * The app's typed API: every procedure of the app router, with the Pinia
 * Colada helpers on each one.
 *
 * Auto-imported in components, pages, composables and plugins, and usable
 * in templates. It reads `useNuxtApp().$trpc` when a procedure is called,
 * so call it where a composable may run: in `setup`, a plugin or route
 * middleware. Every query has `useQuery(input, options?)`, `query(input)`,
 * `queryOptions(input)` and `key(input?)`, every mutation
 * `useMutation(options?)`, `mutate(input)` and `mutationOptions()`, and
 * every namespace `key()`. Keys start with `"trpc"`. Pass a mutation
 * to `useActionForm()` for a form.
 *
 * @example
 * ```ts
 * const post = $api.post.byId.useQuery(() => ({ id: props.id }));
 * const createPost = $api.post.create.useMutation();
 * await useQueryCache().invalidateQueries({ key: $api.post.key() });
 * ```
 */
// a recursive Proxy has no structural type; AppTRPC describes the client it forwards to.
export const $api = apiPath([]) as AppTRPC;
