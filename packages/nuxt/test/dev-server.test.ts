import { devServerOptions } from "./helpers/dev-server";
import { setupApp } from "./helpers/playground";
import "./dev-server/browser-problems";
import "./dev-server/client-ip";
import "./dev-server/client-loggers";
import { LAN_HOST } from "./dev-server/dev-http";
import "./dev-server/devtools-catalog";
import "./dev-server/devtools-collector";
import "./dev-server/devtools-mail";
import "./dev-server/devtools-sql";
import "./dev-server/devtools-tab";
import "./dev-server/error-formatter";
import "./dev-server/payload-size";
import "./dev-server/pretty-logs";
import "./dev-server/queue-board";
import "./dev-server/use-user-hydration";

const options = devServerOptions();

await setupApp({
  ...options,
  env: { ...options.env, HOST: "0.0.0.0", NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --enable-source-maps` },
  browser: true,
  browserOptions: {
    type: "chromium",
    launch: { args: [`--host-resolver-rules=MAP ${LAN_HOST} 127.0.0.1`] },
  },
});
