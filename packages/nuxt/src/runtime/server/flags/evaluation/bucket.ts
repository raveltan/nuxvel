import { createHash } from "node:crypto";

export function bucketOf(salt: string, unitId: string) {
  const digest = createHash("sha256").update(`${salt}:${unitId}`).digest();

  return (digest.readUInt32BE(0) / 2 ** 32) * 100;
}
