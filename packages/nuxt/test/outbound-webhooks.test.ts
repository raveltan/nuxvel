import { createHmac } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { type AddressInfo, createServer as createNetServer } from "node:net";
import { expect, expectNoWebhookSent, expectWebhookSent, guest, runJob } from "@nuxvel/nuxt/testing";
import { afterEach, describe, it } from "vitest";
import { webhookEndpointsTable } from "../../../playground/server/database/schema/webhook-endpoints.schema";
import { useTestDatabase } from "./helpers/database";
import { setupPlayground } from "./helpers/playground";

type Endpoint = { id: number; url: string; secret: string; createdAt: string };
type Delivery = { headers: IncomingHttpHeaders; body: string };

function probe<T>(body: object) {
  return guest().$fetch<T>("/api/_webhook-endpoints-check", { method: "POST", body });
}

function add(url: string) {
  return probe<Endpoint>({ add: url });
}

let close = () => {};
afterEach(() => close());

async function listen(status = 200) {
  const deliveries: Delivery[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      deliveries.push({ headers: request.headers, body });
      response.writeHead(status).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close = () => server.close();

  return { url: `http://localhost:${(server.address() as AddressInfo).port}/hooks`, deliveries };
}

describe("outbound webhooks", async () => {
  await setupPlayground();

  const db = useTestDatabase();

  it("adds an endpoint with a secret, lists it without the secret, and removes it", async () => {
    const endpoint = await add("https://crm.example.com/hooks");

    expect(endpoint.secret).toMatch(/^whsec_/);
    expect(await probe({ list: true })).toEqual([{ id: endpoint.id, url: "https://crm.example.com/hooks", createdAt: endpoint.createdAt }]);

    await probe({ remove: endpoint.id });

    expect(await probe({ list: true })).toEqual([]);
    expect((await guest().fetch("/api/_webhook-endpoints-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ remove: endpoint.id }) })).status).toBe(404);
  });

  it("refuses a URL that is not https or that names a private, loopback-like or metadata address", async () => {
    for (const url of ["http://crm.example.com/hooks", "ftp://crm.example.com", "https://10.0.0.1/hooks", "https://169.254.169.254/latest", "https://[fd00::1]/", "https://0.0.0.0/", "https://192.168.1.10/", "https://[::127.0.0.1]/", "https://[100::1]/"]) {
      const response = await guest().fetch("/api/_webhook-endpoints-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ add: url }) });

      expect(response.status, url).toBe(400);
      expect((await response.json()).data.fields, url).toHaveProperty("url");
    }

    await add("http://localhost:4000/hooks");
  });

  it("dispatches one delivery for each endpoint after the commit, and none for a rolled-back write", async () => {
    const crm = await add("https://crm.example.com/hooks");
    const chat = await add("https://chat.example.com/hooks");

    await probe({ send: "ticket.created", rolledBack: "ticket.rolled-back", data: { id: 7 } });

    const sent = await expectWebhookSent("ticket.created", { data: { id: 7 }, endpoint: crm.id }, { times: 1 });
    await expectWebhookSent("ticket.created", { endpoint: chat.id }, { times: 1 });
    await expectWebhookSent("ticket.created", { data: { id: 7 } }, { times: 1 });
    await expect(expectWebhookSent("ticket.created", { data: { id: 8 } })).rejects.toThrow("expectWebhookSent");
    await expectNoWebhookSent("ticket.rolled-back");
    await expectNoWebhookSent("ticket.other");
    await expect(expectNoWebhookSent()).rejects.toThrow("expectNoWebhookSent");
    expect(sent).toEqual({ type: "ticket.created", timestamp: expect.any(String), data: { id: 7 } });
  });

  it("posts the body signed with the endpoint's secret in the Standard Webhooks headers", async () => {
    const listener = await listen();
    const endpoint = await add(listener.url);
    const body = JSON.stringify({ type: "ticket.created", timestamp: new Date().toISOString(), data: { id: 7 } });

    await runJob("nuxvel.webhook", { endpointId: endpoint.id, messageId: "msg_1", body });

    const [delivery] = listener.deliveries;
    const timestamp = String(delivery?.headers["webhook-timestamp"]);
    const key = Buffer.from(endpoint.secret.replace(/^whsec_/, ""), "base64");
    expect(delivery?.body).toBe(body);
    expect(delivery?.headers["webhook-id"]).toBe("msg_1");
    expect(delivery?.headers["webhook-signature"]).toBe(`v1,${createHmac("sha256", key).update(`msg_1.${timestamp}.${body}`).digest("base64")}`);
  });

  it("retries a delivery that the endpoint refuses, and drops the deliveries of a removed endpoint", async () => {
    const listener = await listen(500);
    const endpoint = await add(listener.url);

    await expect(runJob("nuxvel.webhook", { endpointId: endpoint.id, messageId: "msg_1", body: "{}" })).rejects.toBeRetryable();
    await probe({ remove: endpoint.id });
    await runJob("nuxvel.webhook", { endpointId: endpoint.id, messageId: "msg_1", body: "{}" });

    expect(listener.deliveries).toHaveLength(1);
  });

  it("fails a delivery whose endpoint sends its headers slower than the time limit", async () => {
    let drip: ReturnType<typeof setInterval> | undefined;
    const server = createNetServer((socket) => {
      socket.on("error", () => {});
      socket.write("HTTP/1.1 200 OK\r\n");
      drip = setInterval(() => socket.write("x-drip: 1\r\n"), 1_000);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    close = () => {
      clearInterval(drip);
      server.close();
    };
    const endpoint = await add(`http://localhost:${(server.address() as AddressInfo).port}/hooks`);
    const started = performance.now();

    await expect(runJob("nuxvel.webhook", { endpointId: endpoint.id, messageId: "msg_1", body: "{}" })).rejects.toBeRetryable();
    expect(performance.now() - started).toBeLessThan(12_000);
  }, 20_000);

  it("checks the address again at delivery, and fails without retry when it is private", async () => {
    const [metadata, internal] = await db
      .insert(webhookEndpointsTable)
      .values([
        { url: "https://169.254.169.254/latest/meta-data", secret: "whsec_c2VjcmV0" },
        { url: "https://10.1.2.3/hooks", secret: "whsec_c2VjcmV0" },
      ])
      .returning();

    await expect(runJob("nuxvel.webhook", { endpointId: metadata?.id ?? 0, messageId: "msg_1", body: "{}" })).rejects.toBeUnrecoverable();
    await expect(runJob("nuxvel.webhook", { endpointId: internal?.id ?? 0, messageId: "msg_1", body: "{}" })).rejects.toBeUnrecoverable();
  });
});
