import { expect } from "@nuxvel/nuxt/testing";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { keepAlive } from "../src/runtime/server/realtime/streams/keep-alive";

function fakeStream() {
  const closed: (() => void)[] = [];

  return {
    push: vi.fn(async () => {}),
    onClosed: (callback: () => void) => closed.push(callback),
    close: () => closed.forEach((callback) => callback()),
  };
}

describe("channel stream keep-alive", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("pings an idle stream every 15 seconds so proxies keep it open", () => {
    const stream = fakeStream();

    keepAlive(stream);

    vi.advanceTimersByTime(14_999);
    expect(stream.push).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(stream.push).toHaveBeenCalledExactlyOnceWith({ event: "ping", data: "" });

    vi.advanceTimersByTime(15_000);
    expect(stream.push).toHaveBeenCalledTimes(2);
  });

  it("stops pinging once the stream closes", () => {
    const stream = fakeStream();

    keepAlive(stream);
    stream.close();
    vi.advanceTimersByTime(60_000);

    expect(stream.push).not.toHaveBeenCalled();
  });
});
