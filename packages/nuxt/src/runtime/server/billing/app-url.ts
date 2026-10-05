import { getRequestURL } from "h3";
import { useEvent, useRuntimeConfig } from "nitropack/runtime";

const SESSION_ID_PLACEHOLDER = "{CHECKOUT_SESSION_ID}";

function appOrigin() {
  const siteUrl: string = useRuntimeConfig().siteUrl;

  if (siteUrl) return new URL(siteUrl).origin;

  try {
    return getRequestURL(useEvent()).origin;
  } catch {
    throw new Error("nuxvel: billing needs NUXT_SITE_URL to build a return URL outside a request");
  }
}

export function appUrl(target: string, option: string): string {
  const origin = appOrigin();
  const url = new URL(target.replaceAll(SESSION_ID_PLACEHOLDER, "__checkout_session_id__"), origin);

  if (url.origin !== origin) {
    throw new Error(`nuxvel: ${option} must be a path of the app or a URL on ${origin}, so Stripe sends the user back to the app only`);
  }

  return url.href.replaceAll("__checkout_session_id__", SESSION_ID_PLACEHOLDER);
}
