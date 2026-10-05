import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { defineNitroPlugin } from "nitropack/runtime";

const LISTENING = "tracing:net.server.listen:asyncEnd";

export default defineNitroPlugin(() => {
  if (process.env.pm_id === undefined || !process.send) return;

  const ready = () => {
    unsubscribe(LISTENING, ready);
    process.send?.("ready");
  };

  subscribe(LISTENING, ready);
});
