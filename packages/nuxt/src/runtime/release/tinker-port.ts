import { once } from "node:events";
import { createServer } from "node:net";

export async function takeFreeLoopbackPort() {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  await once(probe, "close");
  process.env.NITRO_HOST = "127.0.0.1";
  process.env.NITRO_PORT = String(typeof address === "object" && address ? address.port : 0);
}
