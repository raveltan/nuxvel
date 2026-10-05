import { join } from "node:path";
import { definitionName as nameFromPath } from "@nuxvel/nuxt/cli";
import { type AppPaths, rootPathFrom } from "../app-layout/app-paths.ts";
import type { GeneratedFile } from "../generated/write-generated.ts";
import { kebabName, requireFile, serverPath } from "./names.ts";

export const TEST_KINDS = ["action", "router", "job", "listener"] as const;

type TestKind = (typeof TEST_KINDS)[number];

const folderKinds: [folder: string, domainFolder: string, kind: TestKind][] = [
  ["actions", "actions", "action"],
  ["trpc/routers", "routers", "router"],
  ["jobs", "jobs", "job"],
  ["listeners", "listeners", "listener"],
];

function kindFromPath(segments: string[]) {
  const path = segments.join("/");

  return folderKinds.find(
    ([folder, domainFolder]) =>
      path.startsWith(`${folder}/`) || (segments[0] === "domains" && segments.length > 3 && segments[2] === domainFolder),
  );
}

export function testKindFromPath(name: string) {
  return kindFromPath(serverPath(name, "actions/posts/create-post"))?.[2];
}

function todoFor(kind: TestKind | undefined, name: string) {
  switch (kind) {
    case "action":
      return `runs the ${name} action with runAction() and checks its effect with expectRow()`;
    case "router":
      return `calls the ${name} router through actingAs(user).trpc.${name} and guest().trpc.${name}`;
    case "job":
      return `runs the ${name} job with runJob() and checks its effect with expectRow()`;
    case "listener":
      return `runs the ${name} listener with runListener() and checks its effect with expectRow()`;
    default:
      return `drives ${name} with the fixtures from @nuxvel/nuxt/testing (runAction, runJob, actingAs, emit, ...)`;
  }
}

export function e2eTestFiles(name: string, paths: AppPaths): GeneratedFile[] {
  const segments = name.split("/").map((segment) => kebabName(segment, "posts/new"));

  return [
    {
      path: join(paths.rootDir, "tests", "e2e", `${segments.join("-")}.test.ts`),
      template: "e2e-test.ts.txt",
      values: { pagePath: `/${segments.join("/")}`, routeName: segments.join("-") },
    },
  ];
}

export function testFiles(name: string, paths: AppPaths, kind?: TestKind): GeneratedFile[] {
  const segments = serverPath(name, "actions/posts/create-post");
  const file = join(paths.serverDir, ...segments);
  requireFile(paths.rootDir, `${file}.ts`, "make:test scaffolds a test next to an existing server file");

  const inferred = kindFromPath(segments);
  const testKind = kind ?? inferred?.[2];
  const path = segments.join(".");
  const definitionName = !testKind
    ? name
    : inferred?.[2] === testKind
      ? nameFromPath(join(paths.serverDir, inferred[0]), `${file}.ts`)
      : path.endsWith(`.${testKind}`)
        ? path.slice(0, -testKind.length - 1)
        : path;

  const values = {
    name,
    todo: todoFor(testKind, definitionName),
    rootPath: rootPathFrom(`${file}.ts`, paths.rootDir),
  };

  return [{ path: `${file}.test.ts`, template: "test-scaffold.ts.txt", values }];
}
