import { basename } from "node:path";
import { defineCommand } from "citty";
import { buildArtifact } from "../build/build-artifact.ts";
import { machineProblems, inspectArchive } from "../build/verify-archive.ts";
import type { DeployEnvironment } from "../deploy/define-deploy.ts";
import { goLive, openDeploy } from "../deploy/deploy-session.ts";
import { unpushedTree } from "../deploy/git-tree.ts";
import { loadEnvironment } from "../deploy/load-environment.ts";
import { planColor } from "../deploy/plan-color.ts";
import { releaseName } from "../deploy/release-name.ts";
import { readSharedEnv } from "../deploy/shared-env-file.ts";
import { sharedEnvProblems } from "../deploy/shared-env-problems.ts";
import { deployScript } from "../server/deploy-script.ts";
import { runOverSsh, uploadOverSsh } from "../server/run-over-ssh.ts";
import { fail } from "../ui/fail.ts";
import { printLine, warn } from "../ui/output.ts";

const SERVER_ARCH = { amd64: "x64", arm64: "arm64" } as const;

async function readArtifact(file: string, environment: DeployEnvironment) {
  if (!file.endsWith(".tar.gz")) fail(`${file} is not a .tar.gz archive`, { hint: "Build one with nuxvel build --artifact" });

  const archive = await inspectArchive(file);
  if (!archive.ok) fail(`${file} failed verification: ${archive.problems.join(", ")}`);

  const expected = SERVER_ARCH[environment.arch];
  if (archive.manifest.arch !== expected || archive.manifest.platform !== "linux") {
    fail(`${basename(file)} is built for ${archive.manifest.platform}/${archive.manifest.arch}, the server is linux/${expected}`, {
      hint: `Build it with nuxvel build --artifact --platform=linux/${environment.arch}`,
    });
  }

  return archive;
}

async function buildForServer(cwd: string, environment: DeployEnvironment, force: boolean) {
  const problem = unpushedTree(cwd);
  if (problem && !force) {
    fail(`The git tree ${problem}`, { hint: "Commit and push it, or deploy it anyway with --force" });
  }

  const platform = `linux/${environment.arch}`;
  const { code, archives } = await buildArtifact({ cwd, platforms: [platform], format: "tar" });
  const [archive] = archives;
  if (code !== 0 || !archive) fail(`The build for ${platform} failed`);

  return archive;
}

export default defineCommand({
  meta: {
    name: "deploy",
    description: "Deploy the app to the server of an environment.",
  },
  args: {
    env: {
      type: "positional",
      description: "Environment in nuxvel.deploy.ts, e.g. production.",
      required: true,
    },
    artifact: {
      type: "string",
      description: "An archive from `nuxvel build --artifact` to deploy. Without it, the deploy builds one.",
    },
    force: {
      type: "boolean",
      description: "Build and deploy a git tree with uncommitted changes or an unpushed commit.",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();
    const { app, environment, server } = await loadEnvironment(cwd, args.env);

    const artifact = args.artifact ?? (await buildForServer(cwd, environment, args.force === true));
    const archive = await readArtifact(artifact, environment);
    const deploy = { cwd, envName: args.env, app, environment, server };
    const session = await openDeploy(deploy, { createMissing: true });
    const { target, variables } = session;

    try {
      const problems = machineProblems(
        archive.manifest,
        { node: session.server.registry.node, platform: "linux", arch: SERVER_ARCH[environment.arch], libc: "glibc" },
        "the server",
      );
      if (problems.length > 0) fail(`${basename(artifact)} cannot run on ${server.host}: ${problems.join(", ")}`);
      const plan = planColor(app, environment, session.server);

      const envProblems = await sharedEnvProblems(await readSharedEnv(target, app));
      if (envProblems.length > 0) {
        fail(`${variables.APP_DIR}/shared/.env fails the server's boot checks: ${envProblems.map(({ message }) => message).join(", ")}`, {
          hint: `Set the variables in .nuxvel/${args.env}.env (nuxvel env:pull ${args.env}) and run nuxvel env:push ${args.env}, nothing is deployed`,
        });
      }

      const release = releaseName(new Date(), archive.manifest.commit);
      const releaseVariables = { ...variables, RELEASE: release, SHA256: archive.sha256 };
      await uploadOverSsh(target, artifact, `${variables.APP_DIR}/releases/${release}.tar.gz`);
      await runOverSsh(target, deployScript("release", releaseVariables), printLine, { failure: "The deploy failed" });
      let deferred = false;
      let waiting = false;
      await runOverSsh(
        target,
        deployScript("migrate", releaseVariables),
        (line) => {
          if (line.startsWith("! Deferred the contract migration")) deferred = true;
          if (line.startsWith("! The contract migration ")) waiting = true;
          printLine(line);
        },
        { failure: "The migrations failed" },
      );
      await goLive(deploy, session, plan, release);
      if (deferred) warn("Contract migrations are deferred", `Run nuxvel db:contract ${args.env} to apply them, now that no older release runs`);
      if (waiting) warn("Contract migrations wait on a backfill", `Run nuxvel db:contract ${args.env} once the backfill completed`);
    } finally {
      await session.release();
    }
  },
});
