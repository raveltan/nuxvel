#!/usr/bin/node
const { execFileSync } = require("node:child_process");
const { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync } = require("node:fs");
const { isAbsolute, join, normalize } = require("node:path");

const ROOT = "/srv/nuxvel/assets";

const [app, action] = process.argv.slice(2);
const apps = JSON.parse(readFileSync("/srv/nuxvel/server.json", "utf8")).apps ?? {};
if (!app || !Object.hasOwn(apps, app) || !["add", "remove"].includes(action)) {
  console.error("Usage: assets <app> <add|remove>, for an app in /srv/nuxvel/server.json");
  process.exit(2);
}

const caller = Number(process.env.SUDO_UID ?? 0);
if (caller !== 0 && statSync(apps[app].folder).uid !== caller) {
  console.error(`You do not own ${apps[app].folder}, so you cannot change the app ${app}`);
  process.exit(2);
}

const served = join(ROOT, app, "_nuxt");

if (action === "add") {
  mkdirSync(served, { recursive: true, mode: 0o755 });
  const staging = mkdtempSync(join(ROOT, ".add-"));
  try {
    execFileSync("tar", ["-x", "--no-same-owner", "--no-same-permissions", "-C", staging], { stdio: ["inherit", "ignore", "inherit"] });
    if (execFileSync("find", [staging, "!", "-type", "f", "!", "-type", "d"]).length > 0) {
      console.error("The assets hold a link or a special file");
      process.exit(1);
    }
    execFileSync("chmod", ["-R", "u=rwX,go=rX", staging]);
    execFileSync("cp", ["-R", "--update=none", `${staging}/.`, `${served}/`]);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
} else {
  for (const name of readFileSync(0, "utf8").split("\n")) {
    if (!name || isAbsolute(name) || normalize(name) !== name || name.split("/").includes("..")) continue;
    const file = join(served, name);
    if (lstatSync(file, { throwIfNoEntry: false })?.isFile()) unlinkSync(file);
  }
}
