import { z } from "zod";

/** @internal The part of a JSON Schema `nuxvel routes --diff` compares. */
export interface RouteSchema {
  properties?: Record<string, RouteSchema | boolean>;
  required?: string[];
  allOf?: (RouteSchema | boolean)[];
}

const routeSchema: z.ZodType<RouteSchema> = z.lazy(() =>
  z.object({
    properties: z.record(z.string(), z.union([routeSchema, z.boolean()])).optional(),
    required: z.array(z.string()).optional(),
    allOf: z.array(z.union([routeSchema, z.boolean()])).optional(),
  }),
);

/**
 * What the `routes` command writes for the CLI: every tRPC procedure of
 * the loaded router with its router file and the JSON Schemas of its
 * input and declared output, and every Nitro route with its handler file.
 *
 * @internal Shared by the module's `routes` command and `@nuxvel/cli`; not
 * meant for app code.
 */
export const appRoutesSchema = z.object({
  procedures: z.array(
    z.object({
      path: z.string(),
      route: z.string(),
      type: z.enum(["query", "mutation", "subscription"]),
      file: z.string(),
      input: routeSchema.nullable(),
      output: routeSchema.nullable(),
    }),
  ),
  handlers: z.array(z.object({ method: z.string(), route: z.string(), handler: z.string() })),
});

/** @internal See {@link appRoutesSchema}. */
export type AppRoutes = z.infer<typeof appRoutesSchema>;
