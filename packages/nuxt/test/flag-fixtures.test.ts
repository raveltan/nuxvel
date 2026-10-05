import { describe, it } from "vitest";
import {
  disableFlag,
  enableFlag,
  expect,
  expectRow,
  forceVariant,
  runAction,
  setFlagTargeting,
  startExperiment,
  stopExperiment,
} from "@nuxvel/nuxt/testing";
import { $experiments, $flags } from "#nuxvel/test-namespaces";
import { flagExposuresTable } from "../../../playground/server/database/schema/flag-exposures.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("flag fixtures", async () => {
  await setupPlayground();

  it("turns a flag on and off for the code under test, given its name or its stub", async () => {
    const author = await userFactory();

    await setFlagTargeting("probe-rollout", { percentage: 100 });
    const on = await runAction("posts.editor-mode", {}, { actingAs: author });

    await setFlagTargeting($flags.probeRollout, { percentage: 0 });
    const off = await runAction("posts.editor-mode", {}, { actingAs: author });

    expect(on.rollout).toBe(true);
    expect(off.rollout).toBe(false);
  });

  it("turns a flag on and off for every user, given its name or its stub", async () => {
    const author = await userFactory();

    await enableFlag("probe-rollout");
    const on = await runAction("posts.editor-mode", {}, { actingAs: author });

    await setFlagTargeting("probe-rollout", { percentage: 0, roles: { [author.role]: true } });
    await disableFlag($flags.probeRollout);
    const off = await runAction("posts.editor-mode", {}, { actingAs: author });

    expect(on.rollout).toBe(true);
    expect(off.rollout).toBe(false);
  });

  it("evaluates a flag for the acting user with no explicit subject", async () => {
    const author = await userFactory();

    await setFlagTargeting("probe-rollout", { percentage: 0, roles: { [author.role]: true } });
    const result = await runAction("posts.editor-mode", {}, { actingAs: author });

    expect(result.rollout).toBe(true);
  });

  it("starts and stops an experiment for the code under test, given its name or its stub", async () => {
    const author = await userFactory();

    await startExperiment("probe-cta");
    const running = await runAction("posts.editor-mode", {}, { actingAs: author });

    await stopExperiment($experiments.probeCta);
    const stopped = await runAction("posts.editor-mode", {}, { actingAs: author });

    expect(running.cta).toMatch(/^(control|green)$/);
    await expectRow(flagExposuresTable, { name: "probe-cta", unitId: author.id, variant: running.cta });
    expect(stopped.cta).toBe("control");
  });

  it("puts every user in the forced variant and records the exposure, given its name or its stub", async () => {
    const author = await userFactory();

    await forceVariant("probe-cta", "green");
    const forced = await runAction("posts.editor-mode", {}, { actingAs: author });
    await expectRow(flagExposuresTable, { name: "probe-cta", unitId: author.id, variant: "green" });

    await forceVariant($experiments.probeCta, "control");
    const control = await runAction("posts.editor-mode", {}, { actingAs: author });

    expect(forced.cta).toBe("green");
    expect(control.cta).toBe("control");
  });
});
