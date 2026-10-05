import type { NuxtSecurityRouteRules } from "nuxt-security";

type ContentSecurityPolicy = Exclude<
  NonNullable<NuxtSecurityRouteRules["headers"]>,
  false
>["contentSecurityPolicy"];
type ConnectSources = Exclude<ContentSecurityPolicy, false | undefined>["connect-src"];

function withSource(sources: ConnectSources, source: string): ConnectSources {
  if (Array.isArray(sources)) {
    return sources.includes(source) ? sources : [...sources, source];
  }

  if (typeof sources === "string") {
    return sources.split(" ").includes(source) ? sources : `${sources} ${source}`;
  }

  return sources;
}

export function dsnOrigin(dsn: string) {
  if (!URL.canParse(dsn)) {
    throw new Error(
      `NUXT_PUBLIC_SENTRY_DSN is not a valid DSN URL (expected http(s)://<key>@<host>/<project>): "${dsn}"`,
    );
  }

  return new URL(dsn).origin;
}

export function allowConnectToOrigin(
  routeRules: Record<string, NuxtSecurityRouteRules>,
  origin: string,
) {
  for (const rule of Object.values(routeRules)) {
    const policy = rule.headers ? rule.headers.contentSecurityPolicy : undefined;

    if (!policy) continue;

    const sources = policy["connect-src"] || policy["default-src"];

    if (sources) policy["connect-src"] = withSource(sources, origin);
  }
}
