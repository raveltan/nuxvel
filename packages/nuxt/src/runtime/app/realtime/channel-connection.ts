import { shallowRef } from "vue";
import type { BroadcastMessage } from "../../shared/realtime/channel-message";
import {
  channelEventName,
  formatChannelRequests,
} from "../../shared/realtime/channel-request";

export type ChannelListener = (message: BroadcastMessage) => void;

interface ChannelState {
  listeners: Set<ChannelListener>;
  resyncListeners: Set<() => void>;
  lastEventId?: string;
  refused: boolean;
}

interface Connected {
  connectionId: string;
  channels: string[];
  refused: string[];
}

/**
 * The state of the tab's realtime connection, as `useChannel()` returns
 * it in `status`: `connecting` until the server answers, `open` while it
 * streams, `reconnecting` between a dropped connection and the next
 * `connected` event, and `closed` when nothing listens.
 */
export type ChannelStatus = "connecting" | "open" | "reconnecting" | "closed";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export const connectionStatus = shallowRef<ChannelStatus>("closed");

const channels = new Map<string, ChannelState>();
const attached = new Map<string, (event: MessageEvent<unknown>) => void>();

let source: EventSource | undefined;
let connectionId: string | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let scheduled = false;
let syncing: Promise<void> = Promise.resolve();
let failedAttempts = 0;

function backoff() {
  const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** failedAttempts);

  failedAttempts += 1;

  return Math.random() * ceiling;
}

function schedule() {
  if (scheduled) return;

  scheduled = true;
  syncing = syncing.then(async () => {
    scheduled = false;

    try {
      await sync();
    } catch {
      reconnect(backoff());
    }
  });
}

function receive(channel: string, event: MessageEvent<unknown>) {
  const state = channels.get(channel);

  if (!state || typeof event.data !== "string") return;
  if (event.lastEventId) state.lastEventId = event.lastEventId;

  const message: BroadcastMessage = JSON.parse(event.data);

  for (const listener of [...state.listeners]) listener(message);
}

function resynced(event: MessageEvent<unknown>) {
  if (typeof event.data !== "string") return;

  const { channel }: { channel: string } = JSON.parse(event.data);

  for (const resync of [...(channels.get(channel)?.resyncListeners ?? [])]) resync();
}

function attach(channel: string) {
  const open = source;

  if (!open || attached.has(channel)) return;

  const handler = (event: MessageEvent<unknown>) => receive(channel, event);

  attached.set(channel, handler);
  open.addEventListener(channelEventName(channel), handler);
}

function detach(channel: string) {
  const handler = attached.get(channel);

  if (!handler) return;

  attached.delete(channel);
  source?.removeEventListener(channelEventName(channel), handler);
}

function disconnect() {
  if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);

  reconnectTimer = undefined;
  source?.close();
  source = undefined;
  connectionId = undefined;
  attached.clear();
  for (const state of channels.values()) state.refused = false;
}

function connected(event: MessageEvent<unknown>) {
  if (typeof event.data !== "string") return;

  const { connectionId: id, channels: joined, refused }: Connected = JSON.parse(
    event.data,
  );

  connectionId = id;
  failedAttempts = 0;
  connectionStatus.value = "open";
  for (const channel of joined) attach(channel);

  for (const channel of refused) {
    const state = channels.get(channel);

    if (state) state.refused = true;
  }

  schedule();
}

function reconnect(delayMs: number) {
  disconnect();

  if (channels.size === 0) {
    connectionStatus.value = "closed";
    return;
  }

  connectionStatus.value = "reconnecting";
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    schedule();
  }, delayMs);
}

function open() {
  const requests = [...channels].map(([name, state]) =>
    state.lastEventId === undefined
      ? { name }
      : { name, lastEventId: state.lastEventId },
  );
  const opened = new EventSource(
    `/api/channels?channels=${formatChannelRequests(requests)}`,
  );

  source = opened;
  if (connectionStatus.value !== "reconnecting") connectionStatus.value = "connecting";
  opened.addEventListener("connected", connected);
  opened.addEventListener("resync", resynced);
  opened.addEventListener("error", () => reconnect(backoff()));
}

async function join(channel: string, state: ChannelState) {
  attach(channel);

  const response = await fetch("/api/channels/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      connectionId,
      channel,
      lastEventId: state.lastEventId,
    }),
  });

  if (response.status === 409) {
    reconnect(0);
    return;
  }

  if (!response.ok) {
    detach(channel);
    state.refused = true;
  }
}

async function leave(channel: string) {
  detach(channel);

  const response = await fetch("/api/channels/leave", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connectionId, channel }),
  });

  if (response.status === 409) reconnect(0);
}

async function sync() {
  if (channels.size === 0) {
    disconnect();
    connectionStatus.value = "closed";
    return;
  }

  if (!source) {
    open();
    return;
  }

  if (connectionId === undefined) return;

  for (const channel of [...attached.keys()]) {
    if (connectionId === undefined) return;
    if (!channels.has(channel)) await leave(channel);
  }

  for (const [channel, state] of [...channels]) {
    if (connectionId === undefined) return;
    if (!attached.has(channel) && !state.refused) await join(channel, state);
  }
}

/** The ID of the tab's open realtime connection, or `undefined` until the server confirms it. */
export function currentConnectionId() {
  return connectionId;
}

/**
 * Starts listening to a channel over the tab's single realtime
 * connection, and returns the call that stops it.
 *
 * Client-only, and the plumbing behind `useChannel()` — reach for that
 * instead. The first subscription opens one `EventSource` on
 * `/api/channels`; later ones join over it, and the last one to leave
 * closes it. A dropped connection, or a join or leave request that fails
 * outright, reopens the connection with the whole channel set after a
 * random delay below one second, doubling the bound on each failure up to
 * 30 seconds, so a tab that went offline recovers and clients of a
 * restarted server do not all return at once. `resync` runs when the server says
 * the channel's replay buffer no longer holds every event this tab
 * missed, so the caller reloads instead of trusting a gap.
 */
export function subscribeToChannel(
  channel: string,
  listener: ChannelListener,
  resync?: () => void,
) {
  const state: ChannelState = channels.get(channel) ?? {
    listeners: new Set(),
    resyncListeners: new Set(),
    refused: false,
  };

  state.listeners.add(listener);
  if (resync) state.resyncListeners.add(resync);
  channels.set(channel, state);
  schedule();

  return () => {
    state.listeners.delete(listener);
    if (resync) state.resyncListeners.delete(resync);
    if (state.listeners.size === 0 && channels.get(channel) === state) {
      channels.delete(channel);
    }
    schedule();
  };
}
