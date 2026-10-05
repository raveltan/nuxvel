import { type H3Event, getRequestHeader, getRequestIP } from "h3";
import { useNuxvelConfig } from "../utils/config";

function isLoopback(address: string | undefined) {
  return address === "::1" || /^(::ffff:)?127\./.test(address ?? "");
}

function xForwardedFor(event: H3Event) {
  return (getRequestHeader(event, "x-forwarded-for")?.split(",") ?? []).map((address) => address.trim()).filter(Boolean);
}

function connection(event: H3Event) {
  const peer = getRequestIP(event);
  const chain = xForwardedFor(event);

  // The Nitro dev worker listens on a socket: its dev proxy puts the client address last in X-Forwarded-For
  if (import.meta.dev && !peer) return { peer: chain.pop(), chain };

  return { peer, chain };
}

/**
 * The address of the client that sent the request.
 *
 * Auto-imported on the server. Without `nuxvel.security.trustProxy` it
 * is the address of the connected peer, and an `X-Forwarded-For` header
 * changes nothing. With it, the address comes from `X-Forwarded-For`:
 * `true` takes the first entry, a number `n` trusts `n` proxies and takes
 * the `n`-th entry from the right, and `"loopback"` trusts one proxy on
 * the same machine: it takes the last entry only when the peer is a
 * loopback address. The `Forwarded` header is always ignored, because
 * common proxies do not remove a client-sent one. `rateLimit({ by: "ip" })`,
 * the `login` limit and the sessions of Better Auth all read it. Returns
 * `undefined` when the address is unknown. In `nuxt dev` the peer is
 * the last `X-Forwarded-For` entry, which the dev proxy of Nitro adds.
 *
 * @example
 * ```ts
 * useLogger("export").info(`export requested from ${clientIp(event)}`);
 * ```
 */
export function clientIp(event: H3Event): string | undefined {
  const { peer, chain } = connection(event);
  const trustProxy = useNuxvelConfig().security?.trustProxy ?? false;
  const hops =
    trustProxy === "loopback"
      ? Number(isLoopback(peer))
      : trustProxy === true
        ? Number.POSITIVE_INFINITY
        : Number(trustProxy) || 0;

  if (hops === 0) return peer;

  return chain[Math.max(0, chain.length - hops)] ?? peer;
}
