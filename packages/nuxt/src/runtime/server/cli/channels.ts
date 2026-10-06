import { writeFile } from "node:fs/promises";
import { useRedis } from "../redis/client";
import { type ListenableChannel, allChannels } from "../realtime/registry";
import { channelTopic } from "../realtime/streams/channel-topic";
import { REPLAY_LENGTH, bufferedEvents } from "../realtime/streams/replay-buffer";
import type { ChannelListing } from "./channel-listing";

async function admitsGuests(channel: ListenableChannel) {
  try {
    return await channel.authorize({ user: null, params: {} });
  } catch {
    return false;
  }
}

async function listeningServers(channel: string) {
  const [, count] = await useRedis("pubsub").pubsub("NUMSUB", channelTopic(channel));

  return Number(count ?? 0);
}

export async function runChannelList(outFile: string): Promise<number> {
  const channels = [...allChannels()].sort((a, b) => a.name.localeCompare(b.name));
  const listing: ChannelListing = {
    channels: await Promise.all(
      channels.map(async (channel) => ({
        name: channel.name,
        guests: await admitsGuests(channel),
        buffered: await bufferedEvents(channel.name),
        replayLimit: REPLAY_LENGTH,
        listeningServers: await listeningServers(channel.name),
      })),
    ),
  };

  await writeFile(outFile, JSON.stringify(listing));

  return 0;
}
