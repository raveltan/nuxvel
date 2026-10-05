import type { Nuxt } from "@nuxt/schema";
import type { ModuleOptions as SecurityOptions } from "nuxt-security";

const DEV_STYLE_SRC = ["'self'", "'unsafe-inline'"];

// the fixed styles Nuxt UI renders on the server: the empty icon style, the radio group, the date segments, the select value and placeholder, the hidden form inputs, the progress root and its bar at 0%
const NUXT_UI_STYLE_ATTRIBUTES = [
  "'unsafe-hashes'",
  "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
  "'sha256-eoXY6JQfqY/foPA402SRqsajCPS1DRalNn+v69CIWWE='",
  "'sha256-cLim1YYrHFdr/oAReQ8mg0AUtmY4hqHyqwr6bEgz3SY='",
  "'sha256-wycEadbqyap1lzI8fe5whjcPll4StPOU2pDRk+cjffU='",
  "'sha256-ex72bnAzXPJtL8L9z9uqfoQPkwU+mz4C7HjRhdTeOpk='",
  "'sha256-U69Fo6J7hD5eUkvIxpmLmjQ1+a9alMwP47/P4FGfA+o='",
  "'sha256-9WpQh2D8WoSVLHEUU/H8we7prHcQ8JoGGV/o+2ylvDo='",
];

const STRIPPED_CONSOLE_CALLS: Exclude<SecurityOptions["removeLoggers"], boolean> = {
  consoleType: ["log", "info", "debug", "warn", "error"],
};

function setsOwn(security: Partial<SecurityOptions> | undefined, directive: "style-src" | "style-src-attr") {
  const policy = security?.headers ? security.headers.contentSecurityPolicy : undefined;

  return Boolean(policy && policy[directive] !== undefined);
}

export function securityDefaults(nuxt: Nuxt, ui: boolean): Partial<SecurityOptions> {
  // nuxt-security augments NuxtOptions only in the app's generated types, which a module never sees
  const { security } = nuxt.options as { security?: Partial<SecurityOptions> };

  if (!nuxt.options.dev) {
    return {
      strict: true,
      rateLimiter: false,
      ...(security?.removeLoggers === undefined ? { removeLoggers: STRIPPED_CONSOLE_CALLS } : {}),
      ...(ui && !setsOwn(security, "style-src-attr")
        ? { headers: { contentSecurityPolicy: { "style-src-attr": NUXT_UI_STYLE_ATTRIBUTES } } }
        : {}),
    };
  }

  return {
    strict: true,
    rateLimiter: false,
    headers: {
      contentSecurityPolicy: {
        "upgrade-insecure-requests": false,
        ...(setsOwn(security, "style-src") ? {} : { "style-src": DEV_STYLE_SRC }),
      },
      strictTransportSecurity: false,
    },
  };
}
