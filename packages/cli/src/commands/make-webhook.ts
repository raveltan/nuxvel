import { defineCommand } from "citty";
import { generate } from "../generators/generate.ts";
import { webhookFiles } from "../generators/make-webhook.ts";
import { forceArg } from "../generators/force-arg.ts";
import { moduleArg } from "../generators/module-arg.ts";

export default defineCommand({
  meta: {
    name: "make:webhook",
    description: "Generate an HMAC-verified defineWebhook under server/webhooks, and its functional test.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the webhook, e.g. billing.stripe (written to server/webhooks/billing/stripe.webhook.ts as stripeWebhook, mounted at POST /api/webhooks/billing.stripe).",
      required: true,
    },
    ...moduleArg,
    ...forceArg,
  },
  async run({ args }) {
    await generate(process.cwd(), (paths) => webhookFiles(args.name, paths), args);
  },
});
