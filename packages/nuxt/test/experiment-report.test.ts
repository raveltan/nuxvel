import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { setupPlayground } from "./helpers/playground";

describe("track() / experimentReport()", async () => {
  await setupPlayground();

  it("reports each variant's conversion rate with a 95% confidence interval", async () => {
    const report = await guest().$fetch("/api/_experiment-report-check");

    expect(report.name).toBe("probe-cta");
    expect(report.variants).toEqual([
      {
        variant: "control",
        weight: 50,
        exposures: 100,
        metrics: [
          {
            metric: "probe.converted",
            conversions: 10,
            rate: 0.1,
            low: expect.closeTo(0.0552, 3),
            high: expect.closeTo(0.1744, 3),
          },
        ],
      },
      {
        variant: "green",
        weight: 50,
        exposures: 100,
        metrics: [
          {
            metric: "probe.converted",
            conversions: 25,
            rate: 0.25,
            low: expect.closeTo(0.1754, 3),
            high: expect.closeTo(0.343, 3),
          },
        ],
      },
    ]);
    expect(report.sampleRatio).toEqual({ pValue: 1, mismatch: false });
  });

  it("flags a sample-ratio mismatch", async () => {
    const report = await guest().$fetch("/api/_experiment-report-check", {
      query: { scenario: "skewed" },
    });

    expect(report.sampleRatio.pValue).toBeCloseTo(4.46e-5, 6);
    expect(report.sampleRatio.mismatch).toBe(true);
  });

  it("counts a conversion once, and only for a user exposed to the experiment", async () => {
    const conversions = await guest().$fetch("/api/_experiment-report-check", {
      query: { scenario: "track" },
    });

    expect(conversions).toEqual([{ unitId: "green-0" }]);
  });
});
