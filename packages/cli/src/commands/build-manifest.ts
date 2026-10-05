import { defineCommand } from "citty";
import { writeBuildManifest } from "../build/build-manifest.ts";
import { measurePageBundles } from "../build/page-bundles.ts";
import { fail } from "../ui/fail.ts";
import { report, success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "build:manifest",
    description:
      "Write nuxvel-manifest.json describing the build and this machine, and check nuxvel.perf.bundle.maxInitialKb. Run right after nuxt build.",
  },
  async run() {
    const cwd = process.cwd();
    const bundles = await measurePageBundles(cwd);

    if (bundles) {
      for (const { page, kb } of bundles.pages) report(`  ${page}  ${kb} KB initial JS and CSS, gzipped`);

      const over = bundles.pages.filter(({ kb }) => kb > bundles.budgetKb);

      if (over.length > 0) {
        fail(`${over.map(({ page }) => page).join(", ")} over the ${bundles.budgetKb} KB initial bundle budget`, {
          hint: "Load the heavy code with a lazy component or a dynamic import(), or raise nuxvel.perf.bundle.maxInitialKb",
        });
      }
    }

    const manifest = await writeBuildManifest(cwd);

    success(
      `Wrote nuxvel-manifest.json: node ${manifest.node} ${manifest.platform}/${manifest.arch} ${manifest.libc ?? ""}`.trimEnd(),
    );
  },
});
