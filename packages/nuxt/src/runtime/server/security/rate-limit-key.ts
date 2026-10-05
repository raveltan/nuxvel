import { isIPv6 } from "node:net";
import type { H3Event } from "h3";
import { useEvent } from "nitropack/runtime";
import { UnauthenticatedError } from "../errors/unauthenticated-error";
import { clientIp } from "./client-ip";

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

function ipv6Prefix(address: string) {
  const [head = "", tail] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];

  return `${groups
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
    .join(":")}::/64`;
}

function limitedAddress(address: string) {
  const unzoned = address.split("%")[0] ?? address;
  const mapped = IPV4_MAPPED.exec(unzoned)?.[1];

  if (mapped) return mapped;

  return isIPv6(unzoned) ? ipv6Prefix(unzoned) : unzoned;
}

export function ipKey(event: H3Event) {
  const address = clientIp(event);

  return `ip:${address ? limitedAddress(address) : "unknown"}`;
}

export function userKey(user: { id: string } | undefined) {
  if (!user) throw new UnauthenticatedError("Sign in first: this is rate limited per signed-in user");

  return `user:${user.id}`;
}

export function requestEvent(limited: string): H3Event {
  try {
    return useEvent();
  } catch {
    throw new Error(
      `nuxvel: ${limited} is rate limited by "ip" or by a key function of the request, but it ran outside a request; limit it by "user" or by a key that needs no request`,
    );
  }
}
