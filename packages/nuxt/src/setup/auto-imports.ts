import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addImports, addImportsDir, addRouteMiddleware, addServerImports, addServerImportsDir, type getLayerDirectories, useNuxt } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";
import type { ResolvedOptions, RuntimeFile } from "./resolved-options";

type ServerImports = Record<"values" | "types", Record<string, string[]>>;

function importsFrom(from: string, names: string[], type?: true) {
  return names.map((name) => ({ name, from, ...(type && { type }) }));
}

function publicServerImports(runtimeFile: RuntimeFile) {
  const serverImports: ServerImports = JSON.parse(
    readFileSync(runtimeFile("./runtime/server/server-imports.json"), "utf8"),
  );
  const serverFile = (file: string) => runtimeFile(`./runtime/server/${file}`);

  return [
    ...Object.entries(serverImports.values).flatMap(([file, names]) =>
      names.map((name) => ({ name, from: serverFile(file) })),
    ),
    ...Object.entries(serverImports.types).flatMap(([file, names]) =>
      names.map((name) => ({ name, from: serverFile(file), type: true })),
    ),
  ];
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
  addServerImports(publicServerImports(runtimeFile));
  const pagination = runtimeFile("./runtime/shared/pagination/pagination");
  const listQuery = runtimeFile("./runtime/shared/pagination/list-query");
  const paginationImports = [
    ...importsFrom(pagination, ["paginationSchema", "paginated"]),
    ...importsFrom(pagination, ["PaginationInput", "Paginated", "CursorPage"], true),
    ...importsFrom(listQuery, ["listQuery", "listQueryParams"]),
    ...importsFrom(listQuery, ["ListQuery", "ListSort", "ListFilterKind", "ListFilters"], true),
  ];
  addServerImports(paginationImports);
  addImports(paginationImports);
  const sanitizedHtmlType = { name: "SanitizedHtml", from: runtimeFile("./runtime/shared/ugc/sanitize-html"), type: true };
  const richText = { name: "richText", from: runtimeFile("./runtime/shared/ugc/rich-text") };
  addServerImports([{ name: "sanitizeHtml", from: runtimeFile("./runtime/shared/ugc/sanitize-html") }, sanitizedHtmlType, richText]);
  addImports([sanitizedHtmlType, richText]);
  if (options.billing) {
    const billing = (file: string) => runtimeFile(`./runtime/server/billing/${file}`);
    addServerImports([
      { name: "defineProduct", from: billing("define-product") },
      { name: "Product", from: billing("define-product"), type: true },
      { name: "ProductName", from: billing("products"), type: true },
      { name: "checkout", from: billing("checkout") },
      { name: "CheckoutOptions", from: billing("checkout"), type: true },
      { name: "billingPortal", from: billing("billing-portal") },
      { name: "BillingUser", from: billing("customer"), type: true },
      { name: "subscribed", from: billing("subscribed") },
      { name: "billingSubscriptionChangedEvent", from: billing("events/subscription-changed") },
      { name: "paid", from: billing("paid") },
      { name: "billingPaidEvent", from: billing("events/paid") },
      { name: "billingRefundedEvent", from: billing("events/refunded") },
      { name: "billingDisputedEvent", from: billing("events/disputed") },
    ]);
  }

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

export function addSharedSchemaImports(nuxt: Nuxt, layerDirectories: ReturnType<typeof getLayerDirectories>) {
  const sharedSchemasDirs = layerDirectories.map((dirs) => join(dirs.shared, "schemas"));
  addServerImportsDir(sharedSchemasDirs);
  addImportsDir(sharedSchemasDirs);
  // Nuxt's builder watcher covers only app/ and server/, so an edit here would not regenerate the app's imports
  if (nuxt.options.dev) nuxt.options.watch.push(...sharedSchemasDirs);
}
