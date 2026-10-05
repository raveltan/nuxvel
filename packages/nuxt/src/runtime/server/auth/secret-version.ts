import { createHash } from "node:crypto";

// Better Auth stamps each ciphertext with a secret version; derive it from the value so it survives key:rotate
export function secretVersion(secret: string): number {
  return Number.parseInt(createHash("sha256").update(secret).digest("hex").slice(0, 8), 16);
}
