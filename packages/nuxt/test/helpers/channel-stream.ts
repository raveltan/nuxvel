import { url } from "@nuxt/test-utils/e2e";

export type StreamMessage = { event: string; data: string; id?: string };

const openStreams = new Set<AbortController>();

function parseMessage(block: string): StreamMessage {
  let event = "message";
  let id: string | undefined;
  const data: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice("event: ".length);
    if (line.startsWith("data: ")) data.push(line.slice("data: ".length));
    if (line.startsWith("id: ")) id = line.slice("id: ".length);
  }

  return id === undefined
    ? { event, data: data.join("\n") }
    : { event, data: data.join("\n"), id };
}

async function* readMessages(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffered = "";

  try {
    for await (const chunk of body) {
      buffered += decoder.decode(chunk, { stream: true });

      let end = buffered.indexOf("\n\n");

      while (end !== -1) {
        yield parseMessage(buffered.slice(0, end));
        buffered = buffered.slice(end + 2);
        end = buffered.indexOf("\n\n");
      }
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) throw error;
  }
}

export async function openStream(
  path: string,
  headers: Record<string, string> = {},
  serverUrl?: string,
) {
  const controller = new AbortController();
  const response = await fetch(
    serverUrl ? new URL(path, serverUrl) : url(path),
    { headers, signal: controller.signal },
  );

  openStreams.add(controller);

  const messages =
    response.ok && response.body ? readMessages(response.body) : undefined;
  let pending: Promise<IteratorResult<StreamMessage>> | undefined;
  let ended = false;

  async function next(timeoutMs = 5000): Promise<StreamMessage | "timeout" | "ended"> {
    if (!messages) throw new Error(`stream answered ${response.status}`);

    pending ??= messages.next();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const result = await Promise.race([pending, timedOut]);

    clearTimeout(timer);

    if (result === "timeout") return "timeout";

    pending = undefined;
    ended = result.done === true;

    return result.done ? "ended" : result.value;
  }

  function close() {
    controller.abort();
    openStreams.delete(controller);
  }

  return { response, next, close, ended: () => ended };
}

export function openChannelStream(
  name: string,
  headers: Record<string, string> = {},
  serverUrl?: string,
) {
  return openStream(`/api/channels/${name}`, headers, serverUrl);
}

export function closeChannelStreams() {
  for (const controller of openStreams) controller.abort();
  openStreams.clear();
}
