import { addImports, addImportsDir, addRouteMiddleware, useNuxt } from "@nuxt/kit";
import type { ResolvedOptions, RuntimeFile } from "./resolved-options";

function importsFrom(from: string, names: string[], type?: true) {
  return names.map((name) => ({ name, from, ...(type && { type }) }));
}

// the composables dir scan finds no types in an installed app's dist .js; priority outranks what it finds in the workspace
const APP_TYPE_IMPORTS: Record<string, string[]> = {
  "optimistic": ["OptimisticUpdate"],
  "use-action-form": ["ActionFormOptions"],
  "use-live-query": ["LiveQueryUpdates"],
  "use-maintenance": ["MaintenanceStatus"],
  "use-notifications": ["NotificationEntry"],
  "use-presence": ["PresenceRoom", "PresenceRoomOf"],
  "use-sessions": ["AuthSession"],
  "router-types": ["RouterInputs", "RouterOutputs"],
};

function publicAppTypeImports(runtimeFile: RuntimeFile) {
  return Object.entries(APP_TYPE_IMPORTS).flatMap(([file, names]) =>
    names.map((name) => ({ name, from: runtimeFile(`./runtime/app/composables/${file}`), type: true, priority: 2 })),
  );
}

export function addAutoImports(options: ResolvedOptions, runtimeFile: RuntimeFile) {
  const pagination = runtimeFile("./runtime/shared/pagination/pagination");
  const listQuery = runtimeFile("./runtime/shared/pagination/list-query");
  addImports([
    ...importsFrom(pagination, ["paginationSchema", "paginated"]),
    ...importsFrom(pagination, ["PaginationInput", "Paginated", "CursorPage"], true),
    ...importsFrom(listQuery, ["listQuery", "listQueryParams"]),
    ...importsFrom(listQuery, ["ListQuery", "ListSort", "ListFilterKind", "ListFilters"], true),
  ]);
  addImports([
    { name: "SanitizedHtml", from: runtimeFile("./runtime/shared/ugc/sanitize-html"), type: true },
    { name: "richText", from: runtimeFile("./runtime/shared/ugc/rich-text") },
  ]);

  addRouteMiddleware([
    {
      name: "auth",
      path: runtimeFile("./runtime/app/middleware/auth"),
    },
    {
      name: "guest",
      path: runtimeFile("./runtime/app/middleware/guest"),
    },
  ]);

  addImportsDir(
    runtimeFile("./runtime/app/composables"),
  );
  addImports(publicAppTypeImports(runtimeFile));

  addImports([
    {
      name: "useSeo",
      // nuxt-og-image installs nothing without SSR, for example in a Storybook build, so defineOgImage does not exist
      from: runtimeFile(options.seo?.ogImage && useNuxt().options.ssr ? "./runtime/app/seo/use-seo-og-image" : "./runtime/app/seo/use-seo"),
    },
    { name: "SeoMeta", from: runtimeFile("./runtime/app/seo/use-seo"), type: true },
  ]);

  addImports([
    { name: "isNetworkError", from: runtimeFile("./runtime/app/trpc/is-network-error") },
    { name: "$api", from: runtimeFile("./runtime/app/trpc/api") },
    { name: "authClient", from: runtimeFile("./runtime/app/auth/client") },
    ...importsFrom(runtimeFile("./runtime/shared/auth/schemas"), ["signInSchema", "signUpSchema", "forgotPasswordSchema", "resetPasswordSchema"]),
  ]);
}
