import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { channelFiles } from "../generators/make-channel.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:channel",
    description: "Generate a signed-in-only defineChannel under server/channels, and its functional test.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the channel, e.g. post.comments (written to server/channels/post/comments.channel.ts as commentsChannel).",
      required: true,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => channelFiles(args.name, paths, args.domain), args);
  },
});
