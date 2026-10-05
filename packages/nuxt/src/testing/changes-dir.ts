import { createHash } from "node:crypto";
import { join } from "node:path";

export function changesDirFor(changesDir: string, testFile: string) {
  return join(changesDir, createHash("sha1").update(testFile).digest("hex"));
}
