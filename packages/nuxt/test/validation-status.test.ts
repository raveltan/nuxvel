import { createHmac } from "node:crypto";
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

const SECRET = "validation-status-webhook-secret";

describe("a validation failure", async () => {
  await setupPlayground({ env: { NUXT_PROBE_WEBHOOK_SECRET: SECRET } });

  it("answers the same status from an action, an upload request and a webhook", async () => {
    const action = await guest().fetch("/api/trpc/_errorFormatterCheck.actionInvalid");
    const upload = await guest().fetch("/api/uploads/_avatar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "image/png", size: -1 }),
    });
    const payload = JSON.stringify({ id: "evt_status" });
    const webhook = await guest().fetch("/api/webhooks/_probe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-probe-signature": createHmac("sha256", SECRET).update(payload).digest("hex"),
      },
      body: payload,
    });

    expect([action.status, upload.status, webhook.status]).toEqual([400, 400, 400]);
    expect(await upload.json()).toMatchObject({ data: { fields: { size: [expect.any(String)] } } });
    expect(await webhook.json()).toMatchObject({ data: { fields: { type: [expect.any(String)] } } });
  });
});
