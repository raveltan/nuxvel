import type { EventStream } from "h3";

const DEFAULT_HEARTBEAT_SECONDS = 15;
const DEFAULT_DRAIN_SECONDS = 30;

type KeptAlive = Pick<EventStream, "push" | "onClosed" | "close">;

const keptAlive = new Set<KeptAlive>();

function heartbeatMs() {
  const seconds = Number(process.env.NUXVEL_REALTIME_HEARTBEAT_SECONDS);

  return (seconds > 0 ? seconds : DEFAULT_HEARTBEAT_SECONDS) * 1000;
}

export function presenceTtlMs() {
  return heartbeatMs() * 2;
}

export function keepAlive(stream: KeptAlive, onPing: () => void = () => {}) {
  const timer = setInterval(() => {
    void stream.push({ event: "ping", data: "" });
    onPing();
  }, heartbeatMs());

  keptAlive.add(stream);
  stream.onClosed(() => {
    clearInterval(timer);
    keptAlive.delete(stream);
  });
}

export async function closeKeptAliveStreams() {
  await Promise.all([...keptAlive].map((stream) => stream.close()));
}

function drainMs() {
  const seconds = Number(process.env.NUXVEL_REALTIME_DRAIN_SECONDS ?? DEFAULT_DRAIN_SECONDS);

  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_DRAIN_SECONDS) * 1000;
}

export function drainKeptAliveStreams() {
  const spreadMs = drainMs();

  for (const stream of keptAlive) setTimeout(() => void stream.close(), Math.random() * spreadMs).unref();
}
