import { lookup } from "node:dns/promises";
import { BlockList, type LookupFunction } from "node:net";

const privateRanges: [string, number, "ipv4" | "ipv6"][] = [
  ["0.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["100.64.0.0", 10, "ipv4"],
  ["127.0.0.0", 8, "ipv4"],
  ["169.254.0.0", 16, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.0.0.0", 24, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["198.18.0.0", 15, "ipv4"],
  ["224.0.0.0", 3, "ipv4"],
  ["::", 96, "ipv6"],
  ["100::", 64, "ipv6"],
  ["64:ff9b::", 96, "ipv6"],
  ["2002::", 16, "ipv6"],
  ["fc00::", 7, "ipv6"],
  ["fe80::", 10, "ipv6"],
  ["ff00::", 8, "ipv6"],
];

const privateAddresses = new BlockList();
const loopbackAddresses = new BlockList();

for (const [network, prefix, family] of privateRanges) privateAddresses.addSubnet(network, prefix, family);
loopbackAddresses.addSubnet("127.0.0.0", 8, "ipv4");
loopbackAddresses.addAddress("::1", "ipv6");

export function loopbackAllowed() {
  return Boolean(import.meta.dev || process.env.VITEST);
}

export function isRefusedAddress(address: string, family: 4 | 6) {
  const type = family === 4 ? "ipv4" : "ipv6";

  if (loopbackAllowed() && loopbackAddresses.check(address, type)) return false;

  return privateAddresses.check(address, type);
}

export function hostOf(url: URL) {
  return url.hostname.replace(/^\[(.*)\]$/, "$1");
}

export async function resolvePublicAddresses(url: URL) {
  const addresses = await lookup(hostOf(url), { all: true });
  const refused = addresses.find(({ address, family }) => isRefusedAddress(address, family === 4 ? 4 : 6));

  return { addresses, refused: refused?.address };
}

export function pinnedLookup(addresses: { address: string; family: number }[]): LookupFunction {
  return (_hostname, options, callback) => {
    const [first] = addresses;

    if (options.all) callback(null, addresses);
    else if (first) callback(null, first.address, first.family);
    else callback(new Error("No address to connect to"), "", 0);
  };
}
