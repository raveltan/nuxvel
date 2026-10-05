/**
 * Builds the declaration that types the `body` and `query` of a `$fetch`
 * call from the {@link defineValidatedHandler} schemas of the route it
 * calls. A route without one keeps ofetch's own option types.
 */
export function buildValidatedRoutesTypes(handlers: { route?: string; method?: string; handler: string }[]) {
  const routes = new Map<string, string[]>();

  for (const { route, method, handler } of handlers) {
    if (!route) continue;

    const file = JSON.stringify(handler.replace(/\.[cm]?[jt]s$/, ""));
    routes.set(route, [...(routes.get(route) ?? []), `${JSON.stringify(method ?? "default")}: typeof import(${file}).default;`]);
  }

  const entries = [...routes].map(([route, methods]) => `  ${JSON.stringify(route)}: { ${methods.join(" ")} };`);

  return `import type { AvailableRouterMethod, NitroFetchRequest } from "nitropack/types";

interface NuxvelRouteHandlers {
${entries.join("\n")}
}

type ValidatedMethods<Methods> = {
  [M in keyof Methods as Methods[M] extends { readonly "~request"?: object } ? M : never]: Methods[M];
};

type NuxvelValidatedRoutes = {
  [Route in keyof NuxvelRouteHandlers as keyof ValidatedMethods<NuxvelRouteHandlers[Route]> extends never ? never : Route]: ValidatedMethods<NuxvelRouteHandlers[Route]>;
};

type SegmentMatches<Segment extends string, Pattern extends string> = Pattern extends \`:\${string}\` ? true : Segment extends Pattern ? true : false;

type PathMatches<Path extends string, Pattern extends string> = Pattern extends \`**\${string}\`
  ? true
  : Pattern extends \`\${infer PatternHead}/\${infer PatternRest}\`
    ? Path extends \`\${infer PathHead}/\${infer PathRest}\`
      ? SegmentMatches<PathHead, PatternHead> extends true ? PathMatches<PathRest, PatternRest> : false
      : false
    : Path extends \`\${string}/\${string}\`
      ? false
      : SegmentMatches<Path, Pattern>;

type WithoutQuery<R extends string> = R extends \`\${infer Path}?\${string}\` ? Path : R;

type MatchedRoute<R> = R extends string
  ? string extends R
    ? never
    : { [Route in keyof NuxvelValidatedRoutes & string]: PathMatches<WithoutQuery<R>, Route> extends true ? Route : never }[keyof NuxvelValidatedRoutes & string]
  : never;

type RoutePart<R, Part extends "body" | "query"> = [MatchedRoute<R>] extends [never]
  ? never
  : NuxvelValidatedRoutes[MatchedRoute<R>] extends infer Methods
    ? Methods[keyof Methods] extends { readonly "~request"?: infer Request }
      ? Request extends Record<Part, infer Value> ? Value : never
      : never
    : never;

type Typed<Value, Fallback> = [Value] extends [never] ? Fallback : Value;

declare module "nitropack/types" {
  interface NitroFetchOptions<R extends NitroFetchRequest, M extends AvailableRouterMethod<R> = AvailableRouterMethod<R>> {
    body?: Typed<RoutePart<R, "body">, RequestInit["body"] | Record<string, any>>;
    query?: Typed<RoutePart<R, "query">, Record<string, any>>;
  }
}

export {};
`;
}
