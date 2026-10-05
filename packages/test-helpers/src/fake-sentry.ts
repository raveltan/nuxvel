import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";

export type CapturedEvent = {
  tags?: Record<string, string>;
  request?: { method?: string; url?: string } & Record<string, unknown>;
  exception?: { values?: { type?: string; value?: string }[] };
};

function eventsInEnvelope(body: string) {
  const [, ...items] = body.split("\n").filter((line) => line.length > 0);
  const events: CapturedEvent[] = [];

  for (let index = 0; index + 1 < items.length; index += 2) {
    const [header = "{}", payload = "{}"] = items.slice(index, index + 2);

    if ((JSON.parse(header) as { type?: string }).type === "event") {
      events.push(JSON.parse(payload) as CapturedEvent);
    }
  }

  return events;
}

export async function startFakeSentry({ respondAfterMs = 0 } = {}) {
  const events: CapturedEvent[] = [];
  const answered: number[] = [];
  const received = new EventEmitter();

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks);
      const body =
        request.headers["content-encoding"] === "gzip"
          ? gunzipSync(raw).toString("utf8")
          : raw.toString("utf8");

      events.push(...eventsInEnvelope(body));
      received.emit("envelope");

      setTimeout(() => {
        response.writeHead(200, {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        });
        response.end("{}", () => answered.push(Date.now()));
      }, respondAfterMs);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const { port } = server.address() as AddressInfo;

  async function waitForEvent(match: (event: CapturedEvent) => boolean) {
    const signal = AbortSignal.timeout(10_000);

    for (;;) {
      const event = events.find(match);

      if (event) return event;

      await once(received, "envelope", { signal }).catch(() => {
        throw new Error(`No matching event reached the fake Sentry; got ${JSON.stringify(events)}`);
      });
    }
  }

  return {
    dsn: `http://public@127.0.0.1:${port}/1`,
    events,
    answered,
    waitForEvent,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
