import superjson from "superjson";
import { once } from "node:events";
import { afterEach, describe, it } from "vitest";
import postgres from "postgres";
import { actingAs, expect, expectNotPresent, expectPresent, type SignedInTestClient } from "@nuxvel/nuxt/testing";
import { $channels } from "#nuxvel/test-namespaces";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { closeChannelStreams, openChannelStream, openStream } from "./helpers/channel-stream";
import { setupPlayground } from "./helpers/playground";
import { startSecondServer } from "./helpers/second-server";
import { sessionCookie } from "./helpers/session-cookie";

const HEARTBEAT = { NUXVEL_REALTIME_HEARTBEAT_SECONDS: "1" };

interface Member {
  userId: string;
  name: string;
  state: Record<string, unknown>;
  connections: number;
}

interface PresenceMessage {
  event: string;
  payload: { userId: string; member?: Member; members?: Member[] };
}

async function setRole(email: string, role: string) {
  const sql = postgres(process.env.NUXT_DATABASE_URL ?? "", { max: 1 });

  try {
    await sql`update "user" set role = ${role} where email = ${email}`;
  } finally {
    await sql.end();
  }
}

async function member(name: string) {
  const user = await userFactory({ name });
  const client = actingAs(user);

  return { client, cookie: await sessionCookie(client), userId: user.id };
}

async function connect(room: string, cookie: string, serverUrl?: string) {
  const stream = await openStream(
    `/api/channels?channels=${encodeURIComponent(JSON.stringify([{ name: room }]))}`,
    { cookie },
    serverUrl,
  );
  const first = await stream.next();

  if (first === "timeout" || first === "ended") throw new Error(`no connected event: ${first}`);

  const { connectionId }: { connectionId: string } = JSON.parse(first.data);

  async function nextPresence(): Promise<PresenceMessage> {
    for (;;) {
      const message = await stream.next(10_000);

      if (message === "timeout" || message === "ended") throw new Error(`no presence event: ${message}`);
      if (message.event === `channel:${room}`) return superjson.parse(message.data);
    }
  }

  const sync = await nextPresence();

  if (sync.event !== "presence.sync") throw new Error(`no presence.sync first: ${sync.event}`);

  return { stream, connectionId, nextPresence, snapshot: sync.payload.members ?? [] };
}

function setState(client: SignedInTestClient, body: Record<string, unknown>) {
  return client.fetch("/api/channels/presence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("channel presence", async () => {
  await setupPlayground({ env: HEARTBEAT });

  afterEach(() => closeChannelStreams());

  it("closes an open stream at the next heartbeat once authorize refuses its user", async () => {
    const email = `presence-demoted-${crypto.randomUUID()}@example.com`;
    const cookie = await sessionCookie(actingAs(await userFactory({ email })));

    await setRole(email, "admin");

    const stream = await openChannelStream("_probe-admins", { cookie });

    expect(await stream.next()).toEqual({ event: "connected", data: "{}" });

    await setRole(email, "user");

    let message = await stream.next();

    for (let pings = 0; pings < 3 && message !== "ended"; pings += 1) message = await stream.next();

    expect(message).toBe("ended");
  });

  it("adds a member on join and tells the room", async () => {
    const ada = await member("Ada");
    const bea = await member("Bea");
    const adaTab = await connect("posts?id=1", ada.cookie);

    expect(await adaTab.nextPresence()).toEqual({
      event: "presence.join",
      payload: { userId: ada.userId, member: { userId: ada.userId, name: "Ada", state: {}, connections: 1 } },
    });

    await connect("posts?id=1", bea.cookie);

    const joined = await adaTab.nextPresence();

    expect(joined).toMatchObject({ event: "presence.join", payload: { userId: bea.userId, member: { name: "Bea" } } });
    expect(joined.payload).not.toHaveProperty("members");
  });

  it("sends the member list only to the joining connection and one member to the room", async () => {
    const ada = await member("Ada");
    const bea = await member("Bea");
    const adaTab = await connect("posts?id=8", ada.cookie);

    expect(adaTab.snapshot).toMatchObject([{ userId: ada.userId, name: "Ada", state: {}, connections: 1 }]);
    await adaTab.nextPresence();

    const beaTab = await connect("posts?id=8", bea.cookie);

    expect(beaTab.snapshot.map((member) => member.name).sort()).toEqual(["Ada", "Bea"]);

    const joined = await adaTab.nextPresence();

    expect(joined.event).toBe("presence.join");
    expect(Object.keys(joined.payload).sort()).toEqual(["member", "userId"]);
  });

  it("passes the room params to authorize", async () => {
    const ada = await member("Ada");
    const stream = await openStream(
      `/api/channels?channels=${encodeURIComponent(JSON.stringify([{ name: "_probe-room?id=1" }, { name: "_probe-room?id=2" }]))}`,
      { cookie: ada.cookie },
    );
    const first = await stream.next();

    if (first === "timeout" || first === "ended") throw new Error(`no connected event: ${first}`);

    const connected: { connectionId: string; channels: string[]; refused: string[] } = JSON.parse(first.data);

    expect(connected.channels).toEqual(["_probe-room?id=1"]);
    expect(connected.refused).toEqual(["_probe-room?id=2"]);

    const join = await ada.client.fetch("/api/channels/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: connected.connectionId, channel: "_probe-room?id=2" }),
    });

    expect(join.status).toBe(403);
  });

  it("counts two tabs of one user as one member", async () => {
    const ada = await member("Ada");
    const first = await connect("posts?id=2", ada.cookie);

    await first.nextPresence();

    const second = await connect("posts?id=2", ada.cookie);

    expect(await first.nextPresence()).toMatchObject({
      event: "presence.update",
      payload: { userId: ada.userId, member: { connections: 2 } },
    });

    second.stream.close();

    expect(await first.nextPresence()).toMatchObject({
      event: "presence.update",
      payload: { userId: ada.userId, member: { connections: 1 } },
    });
  });

  it("shares a member's state and refuses one the schema rejects", async () => {
    const ada = await member("Ada");
    const bea = await member("Bea");
    const adaTab = await connect("posts?id=3", ada.cookie);

    await adaTab.nextPresence();

    const accepted = await setState(ada.client, {
      connectionId: adaTab.connectionId,
      channel: "posts?id=3",
      state: { typing: true },
    });

    expect(accepted.status).toBe(200);
    expect(await adaTab.nextPresence()).toMatchObject({
      event: "presence.update",
      payload: { userId: ada.userId, member: { state: { typing: true } } },
    });

    const invalid = await setState(ada.client, {
      connectionId: adaTab.connectionId,
      channel: "posts?id=3",
      state: { typing: "yes" },
    });

    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ data: { code: "VALIDATION_ERROR" } });

    const stranger = await setState(bea.client, {
      connectionId: adaTab.connectionId,
      channel: "posts?id=3",
      state: { typing: false },
    });

    expect(stranger.status).toBe(403);
  });

  it("removes a member who leaves", async () => {
    const ada = await member("Ada");
    const bea = await member("Bea");
    const adaTab = await connect("posts?id=4", ada.cookie);

    await adaTab.nextPresence();

    const beaTab = await connect("posts?id=4", bea.cookie);

    await adaTab.nextPresence();
    beaTab.stream.close();

    expect(await adaTab.nextPresence()).toEqual({ event: "presence.leave", payload: { userId: bea.userId } });
  });

  it("finds a present member with expectPresent() and fails for an absent one", async () => {
    const ada = await member("Ada");
    const bea = await member("Bea");
    const adaTab = await connect("posts?id=6", ada.cookie);

    await adaTab.nextPresence();

    expect(await expectPresent("posts", { id: 6 }, { id: ada.userId })).toMatchObject({ name: "Ada", connections: 1 });
    await expect(expectPresent("posts", { id: 6 }, { id: bea.userId })).rejects.toThrow(`${bea.userId} is not present`);
    await expect(expectPresent("posts", { id: 7 }, { id: ada.userId })).rejects.toThrow();
    expect(await expectPresent($channels.posts, { id: 6 }, { id: ada.userId })).toMatchObject({ name: "Ada" });
  });

  it("passes expectNotPresent() for an absent member and fails for a present one", async () => {
    const ada = await member("Ada");
    const bea = await member("Bea");
    const adaTab = await connect("posts?id=8", ada.cookie);

    await adaTab.nextPresence();

    await expectNotPresent("posts", { id: 8 }, { id: bea.userId });
    await expectNotPresent($channels.posts, { id: 9 }, { id: ada.userId });
    await expect(expectNotPresent("posts", { id: 8 }, { id: ada.userId })).rejects.toThrow(`${ada.userId} is present`);
  });

  it("removes a member whose server stopped without a leave once the heartbeat expires", async () => {
    const second = await startSecondServer({ env: HEARTBEAT });

    try {
      const ada = await member("Ada");
      const bea = await member("Bea");
      const adaTab = await connect("posts?id=5", ada.cookie);

      await adaTab.nextPresence();
      await connect("posts?id=5", bea.cookie, second.url);

      expect(await adaTab.nextPresence()).toMatchObject({ event: "presence.join", payload: { userId: bea.userId } });

      second.child.kill("SIGKILL");
      await once(second.child, "exit");

      expect(await adaTab.nextPresence()).toEqual({ event: "presence.leave", payload: { userId: bea.userId } });
    } finally {
      second.child.kill("SIGKILL");
    }
  }, 40_000);
});
