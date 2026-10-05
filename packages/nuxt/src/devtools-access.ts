import { defineEventHandler, getRequestHeader, getRequestIP, type H3Event, setResponseStatus } from "h3";

const LOOPBACK_HOSTNAME = /^(localhost|[a-z0-9.-]+\.localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\])$/i;

function isLoopbackAddress(address: string) {
  const normalized = address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/^::ffff:/, "");

  return normalized === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
}

function fromLoopback(event: H3Event) {
  const peer = getRequestIP(event);
  const forwarded = getRequestHeader(event, "x-forwarded-for")?.split(",") ?? [];
  const hostname = getRequestHeader(event, "host")?.replace(/:\d+$/, "") ?? "";

  return peer !== undefined && [peer, ...forwarded].every(isLoopbackAddress) && LOOPBACK_HOSTNAME.test(hostname);
}

function isGuarded(event: H3Event, paths: readonly string[]) {
  const pathname = event.path.split("?")[0] ?? "";

  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function devtoolsAccessGate(paths: readonly string[]) {
  return defineEventHandler((event) => {
    if (!isGuarded(event, paths) || fromLoopback(event)) return;

    setResponseStatus(event, 403);
    return "Forbidden";
  });
}
