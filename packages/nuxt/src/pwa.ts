import type { ModuleOptions as VitePwaOptions } from "@vite-pwa/nuxt";

/** One icon of the web app manifest, as the `icons` member lists it. */
export interface PwaIcon {
  /** The icon's URL, e.g. `/icon-192.png` for `public/icon-192.png`. */
  src: string;
  /** Its size in pixels, e.g. `"192x192"`. */
  sizes: string;
  /** Its MIME type, e.g. `"image/png"`. */
  type?: string;
  /** `"any"`, `"maskable"` or `"monochrome"`. */
  purpose?: string;
}

/** The `nuxvel.pwa` block: what the web app manifest says about the app. */
export interface PwaOptions {
  /** The app's full name, shown on the install prompt and the splash screen. */
  name: string;
  /** A short name for the home screen, where `name` does not fit. */
  shortName?: string;
  /** The browser UI color, as a CSS color. Also sent as the `theme-color` meta tag. */
  themeColor?: string;
  /** The app's icons. Browsers need a 192x192 and a 512x512 PNG to offer the install. */
  icons?: PwaIcon[];
}

export const OFFLINE_PATH = "/offline";

// the service worker gets these as source text, so they must not reference anything outside themselves
const isNavigation = ({ request }: { request: Request }) => request.mode === "navigate";
const isSameOriginAsset = ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
  sameOrigin && ["image", "font", "style", "script"].includes(request.destination);
const storesOnlyShareable = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.status === 200 && !/private|no-store/.test(response.headers.get("cache-control") ?? "") ? response : null,
};

export function vitePwaOptions(options: PwaOptions, buildId: string) {
  return {
    registerType: "prompt",
    registerWebManifestInRouteRules: true,
    client: { installPrompt: true },
    manifest: {
      name: options.name,
      short_name: options.shortName ?? options.name,
      theme_color: options.themeColor,
      icons: options.icons ?? [],
      start_url: "/",
      display: "standalone",
    },
    workbox: {
      importScripts: ["nuxvel-push-sw.js"],
      navigateFallback: null,
      additionalManifestEntries: [{ url: OFFLINE_PATH, revision: buildId }],
      runtimeCaching: [
        {
          urlPattern: isNavigation,
          handler: "NetworkFirst",
          options: {
            cacheName: "nuxvel-pages",
            plugins: [storesOnlyShareable],
            precacheFallback: { fallbackURL: OFFLINE_PATH },
          },
        },
        {
          urlPattern: isSameOriginAsset,
          handler: "StaleWhileRevalidate",
          options: { cacheName: "nuxvel-assets", plugins: [storesOnlyShareable] },
        },
      ],
    },
  } satisfies VitePwaOptions;
}
