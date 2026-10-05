import { devServerOptions } from "./helpers/dev-server";
import { setupApp } from "./helpers/playground";
import "./dev-server-json-logs/devtools-requests";
import "./dev-server-json-logs/request-errors";
import "./dev-server-json-logs/devtools-spans";

const options = devServerOptions();

await setupApp({ ...options, env: { ...options.env, NUXT_LOG_FORMAT: "json" }, browser: true });
