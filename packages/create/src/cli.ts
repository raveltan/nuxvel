import { relative } from "node:path";
import { parseArgs } from "node:util";
import { cancel, intro, isCancel, log, note, outro, text } from "@clack/prompts";
import { createApp } from "./create-app.ts";
import { packageNameFor } from "./package-name.ts";

const usage = `Usage: npm create nuxvel <directory> [-- --local]

Options:
  --local  depend on the nuxvel checkout this runs from instead of npm
  --help   print this message`;

function fail(message: string): never {
  console.error(`${message}\n\n${usage}`);
  process.exit(1);
}

function parse() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        local: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

async function askForDirectory() {
  const answer = await text({
    message: "Where should the app go?",
    placeholder: "./my-app",
    defaultValue: "my-app",
  });

  if (isCancel(answer)) {
    cancel("Cancelled, nothing was written.");
    process.exit(1);
  }

  return answer;
}

const { positionals, values } = parse();

if (values.help) {
  console.log(usage);
  process.exit(0);
}

const [givenDir, ...extra] = positionals;
const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;

if (!givenDir && !interactive) fail("Missing the directory to create the app in.");
if (extra.length > 0) fail(`Expected one directory, got ${positionals.length}: ${positionals.join(" ")}`);

intro("create-nuxvel");

const targetDir = givenDir ?? (await askForDirectory());
const startedAt = performance.now();

try {
  const appDir = createApp({ targetDir, local: values.local });
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);

  const nextSteps = [
    `cd ${relative(process.cwd(), appDir) || "."}`,
    "npm install",
    "./nv services up",
    "./nv test",
    "./nv db:migrate",
    "./nv db:seed",
    "npm run dev",
    `then open https://${packageNameFor(appDir).replace(/[._-]+/g, "-")}.localhost`,
    "README.md shows what to build next",
  ];

  log.step(`Created a nuxvel app in ${appDir} (${seconds}s)`);
  note(nextSteps.join("\n"), "Next steps");
  outro("Happy building");
} catch (error) {
  cancel(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
