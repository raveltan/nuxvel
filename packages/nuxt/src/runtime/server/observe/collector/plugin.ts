import { getResponseStatus, setResponseHeaders } from "h3";
import type { NitroApp } from "nitropack/types";
import { defineNitroPlugin } from "nitropack/runtime";
import { wrapPoolClient } from "../../database/connection/pool";
import { timedClient } from "../../database/connection/timed-client";
import { loggedPath } from "../logged-path";
import type { CollectedEntry } from "./collected-entry";
import { closeRequestEntry, collectEffects, openRequestEntry, ownRequestEntry } from "./collect-effects";
import { debugHeaders } from "./debug-headers";
import { storeEntry } from "./entries-buffer";
import { appendToStream, tailStream } from "./entries-stream";

const NUXVEL_OWN_PATHS = "/_nuxvel/";

function collectOnDevServer(nitro: NitroApp) {
  const stopCollecting = collectEffects(storeEntry);
  const stopTailing = tailStream(storeEntry);

  nitro.hooks.hook("request", (event) => {
    const id = event.context.nuxvelRequestId;

    if (id === undefined || event.path.startsWith(NUXVEL_OWN_PATHS)) return;

    openRequestEntry(event.context, id, `${event.method} ${loggedPath(event.path)}`);
  });

  nitro.hooks.hook("beforeResponse", (event) => {
    const entry = ownRequestEntry(event.context);

    if (entry && !event.node.res.headersSent) setResponseHeaders(event, debugHeaders(entry));
  });

  nitro.hooks.hook("afterResponse", (event) => {
    const entry = closeRequestEntry(event.context, getResponseStatus(event));

    if (entry) storeEntry(entry);
  });

  nitro.hooks.hook("close", () => {
    stopTailing();
    stopCollecting();
  });
}

function collectIntoStream(nitro: NitroApp) {
  const appending = new Set<Promise<void>>();
  const stopCollecting = collectEffects((entry: CollectedEntry) => {
    const append = appendToStream(entry).catch(() => {});

    appending.add(append);
    void append.finally(() => appending.delete(append));
  });

  nitro.hooks.hook("close", async () => {
    await Promise.all(appending);
    stopCollecting();
  });
}

export default defineNitroPlugin((nitro) => {
  if (!import.meta.dev && process.env.NODE_ENV === "production") return;

  wrapPoolClient(timedClient);
  if (import.meta.dev) collectOnDevServer(nitro);
  else collectIntoStream(nitro);
});
