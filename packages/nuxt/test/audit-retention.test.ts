import { expect, guest } from "@nuxvel/nuxt/testing";
import { beforeAll, describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";
import { ensureBucket } from "./helpers/storage";
import { TEST_STORAGE_BUCKET } from "./setup/constants";

function partitionName(iso: string) {
  return `audit_log_y${iso.slice(0, 4)}m${iso.slice(5, 7)}`;
}

describe("audit partition retention", async () => {
  await setupPlayground();

  beforeAll(() => ensureBucket(TEST_STORAGE_BUCKET));

  it("exports a partition older than the configured retention as gzipped JSON lines, drops it and keeps a recent one", async () => {
    const body = await guest().$fetch("/api/_audit-retention-check");

    expect(body.dropped).toContain(partitionName(body.old));
    expect(body.partitions).not.toContain(partitionName(body.old));
    expect(body.partitions).toContain(partitionName(body.recent));
    expect(body.rows).toEqual([body.recent]);
    expect(body.exported).toEqual([body.old]);
  });
});
