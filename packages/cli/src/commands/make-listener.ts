import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { listenerFiles } from "../generators/make-listener.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:listener",
    description: "Generate a queued defineListener for an event under server/listeners, and its functional test.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the listener, e.g. post.notify-subscribers (written to server/listeners/post/notify-subscribers.listener.ts as notifySubscribersListener).",
      required: true,
    },
    event: {
      type: "string",
      description: "Name of the event to listen to, as given to make:event, e.g. post.published.",
      required: true,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => listenerFiles(args.name, args.event, paths, args.domain), args);
  },
});
