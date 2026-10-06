import { computed, type ComputedRef } from "vue";
import { useRoute } from "#app";
import type { z } from "zod";

type RouteInputSchema = z.ZodType<object, object>;

type WithDefaults<S extends RouteInputSchema> = {} extends z.input<S> ? S : never;

function parsedRoutePart<S extends RouteInputSchema>(schema: S | undefined, read: () => object): ComputedRef<z.output<S>> {
  if (!schema) return computed(() => {
    throw new Error("useRouteInput: this part of the route has no schema");
  });
  const defaults = schema.parse({});

  return computed(() => {
    const value = read();
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const invalid = new Set(parsed.error.issues.map((issue) => issue.path[0]));
    const valid = schema.safeParse(Object.fromEntries(Object.entries(value).filter(([key]) => !invalid.has(key))));

    return valid.success ? valid.data : defaults;
  });
}

/**
 * Parses the `query` and the `params` of the current route with a Zod
 * schema each, and returns each result as a computed ref that follows
 * the route.
 *
 * Auto-imported. An invalid or missing value never throws: its key
 * falls back to the default of its schema, and the valid keys keep
 * their value. A failed object-level check, such as `.refine()` or an
 * unknown key under `.strict()`, falls back to the defaults as a whole.
 * So every key needs a `.default()` or `.optional()`, which the types
 * check. Query values are strings, so a number or a boolean needs
 * `z.coerce`. It throws only for a schema that rejects its own
 * defaults, when it is called, and when a part without a schema is read.
 *
 * @param schemas.query - The schema of `route.query`.
 * @param schemas.params - The schema of `route.params`.
 *
 * @example
 * ```ts
 * const { query } = useRouteInput({
 *   query: z.object({ page: z.coerce.number().int().min(1).default(1), search: z.string().optional() }),
 * });
 * const posts = $api.post.list.useQuery(() => query.value);
 * ```
 */
export function useRouteInput<Q extends RouteInputSchema = never, P extends RouteInputSchema = never>(schemas: {
  query?: Q & WithDefaults<Q>;
  params?: P & WithDefaults<P>;
}): { query: ComputedRef<z.output<Q>>; params: ComputedRef<z.output<P>> } {
  const route = useRoute();

  return {
    query: parsedRoutePart(schemas.query, () => route.query),
    params: parsedRoutePart(schemas.params, () => route.params),
  };
}
