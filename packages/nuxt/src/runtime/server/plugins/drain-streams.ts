import { defineNitroPlugin } from "nitropack/runtime";
import { drainKeptAliveStreams } from "../realtime/streams/keep-alive";

export default defineNitroPlugin(() => {
  if (process.env.pm_id === undefined) return;

  process.on("SIGUSR2", drainKeptAliveStreams);
});
