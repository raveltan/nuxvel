import { errorMessage } from "../error-message.ts";
import { type UrlDoctorCheck, failed, passed } from "./doctor-check.ts";

const FIRST_EVENT_TIMEOUT_MS = 5_000;

async function firstEvent(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = "";

  while (!received.includes("\n\n")) {
    const { value, done } = await reader.read();

    if (done) return undefined;
    received += decoder.decode(value, { stream: true });
  }

  return received;
}

export const checkServerSentEvents: UrlDoctorCheck = {
  name: "server-sent events",
  async run({ url }) {
    const endpoint = new URL("/api/channels/flags", url).toString();
    const timeout = AbortSignal.timeout(FIRST_EVENT_TIMEOUT_MS);
    const stop = new AbortController();

    try {
      const response = await fetch(endpoint, {
        headers: { accept: "text/event-stream" },
        signal: AbortSignal.any([timeout, stop.signal]),
      });

      if (!response.ok || !response.body) return [failed(`${endpoint} returned ${response.status}`)];

      return (await firstEvent(response.body))
        ? [passed("a channel stream delivers its first event at once")]
        : [failed(`${endpoint} closed before its first event`)];
    } catch (error) {
      if (timeout.aborted) {
        return [
          failed(
            `no event from ${endpoint} arrived within ${FIRST_EVENT_TIMEOUT_MS / 1000} s`,
            "A proxy buffers the stream: turn buffering off for /api/channels (proxy_buffering off in nginx)",
          ),
        ];
      }

      return [failed(`${endpoint} is unreachable: ${errorMessage(error)}`)];
    } finally {
      stop.abort();
    }
  },
};
