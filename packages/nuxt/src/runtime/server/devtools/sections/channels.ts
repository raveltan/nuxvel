import channels from "#nuxvel/channels";
import { countOpenStreams } from "../../realtime/streams/open-streams";
import { defineDevtoolsSection } from "../define-devtools-section";
import type { ChannelsSectionData } from "../../../shared/devtools/sections/channels";

export default defineDevtoolsSection<ChannelsSectionData>({
  id: "channels",
  title: "Channels",
  order: 80,
  load: async () =>
    channels
      .map((channel) => ({
        name: channel.name,
        events: Object.keys(channel.events),
        connections: countOpenStreams(channel.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
});
