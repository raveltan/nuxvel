import {
  defineEventHandler,
  getValidatedQuery,
  getValidatedRouterParams,
  readValidatedBody,
  type EventHandler,
  type EventHandlerRequest,
  type EventHandlerResponse,
  type H3Event,
} from "h3";
import type { z } from "zod";

/** The schemas {@link defineValidatedHandler} checks a request against. */
export interface RequestSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

type Output<Schema> = Schema extends z.ZodType ? z.output<Schema> : undefined;

type Input<Schema> = Schema extends z.ZodType ? z.input<Schema> : never;

/** The parsed parts of a request that {@link defineValidatedHandler} hands to its handler. */
export interface ValidatedRequest<Schemas extends RequestSchemas> {
  body: Output<Schemas["body"]>;
  query: Output<Schemas["query"]>;
  params: Output<Schemas["params"]>;
}

/**
 * The event handler {@link defineValidatedHandler} returns. `~request`
 * never exists at runtime: it carries the body and query types to the
 * typed `$fetch`.
 */
export type ValidatedHandler<Schemas extends RequestSchemas, Response extends EventHandlerResponse> = EventHandler<
  EventHandlerRequest,
  Response
> & {
  readonly "~request"?: { body: Input<Schemas["body"]>; query: Input<Schemas["query"]> };
};

function parse(schema: z.ZodType | undefined) {
  return schema && ((value: unknown) => schema.parse(value));
}

/**
 * Defines a Nitro route handler whose body, query and route params are
 * checked against Zod schemas before the handler runs.
 *
 * Auto-imported on the server. A part that fails its schema answers
 * `400` in the {@link ValidationFailedError} shape (`code:
 * "VALIDATION_ERROR"` with `fields`), and the handler does not run. A
 * part without a schema is `undefined`. `$fetch` to the route, in the
 * app and on the server, is typed with the schema inputs: a wrong
 * `body` or `query` fails `nuxt typecheck`. Prefer a tRPC procedure for
 * the app's own API; reach for this in a plain route, such as one a
 * third party calls.
 *
 * @param schemas.body Checks the JSON or form body.
 * @param schemas.query Checks the query string.
 * @param schemas.params Checks the route params, e.g. `[slug]` in the file name.
 *
 * @example
 * ```ts
 * // server/api/newsletter.post.ts
 * export default defineValidatedHandler(
 *   { body: z.object({ email: z.email() }) },
 *   async (event, { body }) => {
 *     await subscribeToNewsletter(body.email);
 *     return { subscribed: true };
 *   },
 * );
 * ```
 */
export function defineValidatedHandler<Schemas extends RequestSchemas, Response extends EventHandlerResponse>(
  schemas: Schemas,
  handler: (event: H3Event, request: ValidatedRequest<Schemas>) => Response | Promise<Response>,
): ValidatedHandler<Schemas, Promise<Response>> {
  const parseParams = parse(schemas.params);
  const parseQuery = parse(schemas.query);
  const parseBody = parse(schemas.body);

  return defineEventHandler(async (event) => {
    const params = parseParams && (await getValidatedRouterParams(event, parseParams));
    const query = parseQuery && (await getValidatedQuery(event, parseQuery));
    const body = parseBody && (await readValidatedBody(event, parseBody));

    // a runtime check on the schema cannot narrow the deferred conditional types of ValidatedRequest
    return handler(event, { body, query, params } as ValidatedRequest<Schemas>);
  });
}
