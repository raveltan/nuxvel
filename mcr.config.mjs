import { resolve } from "node:path";

const PACKAGES = ["nuxt", "cli"];
const METRICS = ["lines", "functions", "statements", "branches"];

const inSource = (path) => /(^|\/)packages\/(nuxt|cli)\/src\//.test(path);

function printPackageSummary(files) {
  for (const name of PACKAGES) {
    const own = files.filter((file) => file.sourcePath.includes(`packages/${name}/src/`));
    const totals = METRICS.map((metric) => {
      const covered = own.reduce((sum, file) => sum + (file.summary[metric].covered ?? 0), 0);
      const total = own.reduce((sum, file) => sum + (file.summary[metric].total ?? 0), 0);
      return `${metric} ${total ? ((100 * covered) / total).toFixed(1) : "-"}% (${covered}/${total})`;
    });
    console.log(`packages/${name}/src, ${own.length} files: ${totals.join(", ")}`);
  }
}

export default {
  name: "nuxvel coverage",
  outputDir: "coverage",
  reports: ["v8"],
  entryFilter: (entry) =>
    inSource(entry.url) || (!/\.(ts|vue)(\?|$)/.test(entry.url) && !/\/node_modules\/(?!\.cache\/)/.test(entry.url)),
  sourceFilter: inSource,
  onStart: () => {
    // mcr sets a relative NODE_V8_COVERAGE, which a child started in another directory would resolve elsewhere
    process.env.NODE_V8_COVERAGE = resolve(process.env.NODE_V8_COVERAGE);
  },
  onEnd: (results) => printPackageSummary(results?.files ?? []),
};
