import { afterAll, beforeAll } from "vitest";
import { addWatchedAction } from "./dev-scratch-app/action-mount-watch";
import { addExtraLocales } from "./dev-scratch-app/extra-locales";
import { addGreetingsRouter } from "./dev-scratch-app/procedure-inputs-watch";
import { addRoutersDir } from "./dev-scratch-app/router-watch";
import { addSharedSchema } from "./dev-scratch-app/shared-schemas-watch";
// the namespace suite restarts the dev server, and a file written while the new watcher still scans is never seen, so it runs last
import { addNamespacesRoute } from "./dev-scratch-app/namespace-watch";
import { setupApp } from "./helpers/playground";
import { createScratchApp, removeScratchApp, scratchAppDir } from "./helpers/scratch-app";

const appDir = scratchAppDir("dev-scratch-app");

beforeAll(() => {
  createScratchApp(appDir);
  addExtraLocales(appDir);
  addNamespacesRoute(appDir);
  addRoutersDir(appDir);
  addSharedSchema(appDir);
  addWatchedAction(appDir);
  addGreetingsRouter(appDir);
});
afterAll(() => removeScratchApp(appDir));

await setupApp({ rootDir: appDir, dev: true });
