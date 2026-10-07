import { channelListingSchema } from "@nuxvel/nuxt/cli";
import { defineCommand } from "citty";
import { loadFromApp } from "../app-server/load-from-app.ts";
import { jsonArg, printJson } from "../ui/json-arg.ts";
import { report } from "../ui/output.ts";
import { printTable } from "../ui/table.ts";

export default defineCommand({
  meta: {
    name: "channel:list",
    description: "List the realtime channels with whether guests may listen, their replay buffer and the servers listening now.",
  },
  args: { ...jsonArg },
  async run({ args }) {
    const listing = await loadFromApp(
      process.cwd(),
      (outFile) => ({ kind: "channels", outFile }),
      channelListingSchema,
    );

    if (!listing) {
      process.exitCode = 1;
      return;
    }

    if (args.json) {
      printJson(listing);
      return;
    }

    if (listing.channels.length === 0) {
      report("No channels discovered under server/channels");
      return;
    }

    printTable(
      ["NAME", "GUESTS", "REPLAY BUFFER", "SERVERS LISTENING"],
      listing.channels.map((channel) => [
        channel.name,
        channel.guests ? "allowed" : "refused",
        `${channel.buffered} of ${channel.replayLimit}`,
        String(channel.listeningServers),
      ]),
    );
  },
});
