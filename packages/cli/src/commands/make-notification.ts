import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { notificationFiles } from "../generators/make-notification.ts";
import { domainArg } from "../generators/domain-arg.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:notification",
    description: "Generate a database-channel defineNotification under server/notifications, and its functional test.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the notification, e.g. post.published (written to server/notifications/post/published.notification.ts as publishedNotification).",
      required: true,
    },
    ...domainArg,
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => notificationFiles(args.name, paths, args.domain), args);
  },
});
