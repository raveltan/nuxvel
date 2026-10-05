import { createHash } from "node:crypto";
import {
  type H3Event,
  createError,
  defineEventHandler,
  getCookie,
  getRequestProtocol,
  sendRedirect,
  setCookie,
  setResponseHeaders,
} from "h3";
import { useRuntimeConfig } from "nitropack/runtime";
import { TRPC_PATH } from "../../shared/trpc/trpc-path";
import { clientIp } from "../security/client-ip";
import { sameText } from "../security/same-text";
import { MaintenanceError } from "./maintenance-error";
import { type MaintenanceState, maintenanceState } from "./state";

const BYPASS_COOKIE = "nuxvel_maintenance";

const BYPASS_MAX_AGE = 12 * 60 * 60;

const ALWAYS_UP = ["/_nuxvel/", "/__nuxt_error"];

const STAYS_UP = ["/api/health/", "/api/channels"];

function bypassToken(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function holdsBypass(event: H3Event, secret: string) {
  return sameText(bypassToken(secret), getCookie(event, BYPASS_COOKIE) ?? "");
}

function unmapped(ip: string) {
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}

function admitted(event: H3Event, state: MaintenanceState) {
  const ip = clientIp(event);

  return (
    (state.secret !== null && holdsBypass(event, state.secret)) ||
    (ip !== undefined && state.allow.map(unmapped).includes(unmapped(ip)))
  );
}

async function currentState() {
  try {
    return await maintenanceState();
  } catch {
    return undefined;
  }
}

export default defineEventHandler(async (event) => {
  const path = event.path;

  // a server-side fetch (SSR, the error page) belongs to a request this middleware already let through or refused
  if ("__unenv__" in event.node.req) return;
  if (path.startsWith(useRuntimeConfig().app.buildAssetsDir) || ALWAYS_UP.some((prefix) => path.startsWith(prefix))) {
    return;
  }

  const state = await currentState();

  if (!state) return;

  if (state.secret !== null && path.split("?")[0] === `/${state.secret}`) {
    setCookie(event, BYPASS_COOKIE, bypassToken(state.secret), {
      httpOnly: true,
      sameSite: "lax",
      secure: getRequestProtocol(event) === "https",
      path: "/",
      maxAge: BYPASS_MAX_AGE,
    });

    return sendRedirect(event, "/");
  }

  const passes = STAYS_UP.some((prefix) => path.startsWith(prefix)) || admitted(event, state);

  event.context.nuxvelMaintenance = { message: state.message, retryAfter: state.retryAfter, admitted: passes };

  if (passes) return;

  setResponseHeaders(event, { "retry-after": state.retryAfter, "cache-control": "no-store" });

  if (path.startsWith(TRPC_PATH)) return;

  throw createError({ statusCode: 503, cause: new MaintenanceError(state.message, state.retryAfter) });
});
