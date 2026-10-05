import { type ChildProcess, type StdioOptions, spawn } from "node:child_process";
import { createReadStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { fail } from "../ui/fail.ts";
import { KNOWN_HOSTS_FILE, knownHostsPath } from "./known-hosts.ts";
import { shellQuote } from "./shell-script.ts";

export type SshTarget = { host: string; user: string; knownHosts: string };

type SshOptions = { command?: string; failure?: string };

export function sshTarget(cwd: string, server: { host: string; user: string }, user = server.user): SshTarget {
  return { host: server.host, user, knownHosts: knownHostsPath(cwd) };
}

function sshOptions(target: SshTarget) {
  if (/["\\%$]/.test(target.knownHosts)) {
    fail(`ssh cannot read the host keys pinned in ${target.knownHosts}: the path contains " \\ % or $`, {
      hint: "Move the project to a folder whose path has none of these characters",
    });
  }

  mkdirSync(dirname(target.knownHosts), { recursive: true });

  return [
    "-o", `UserKnownHostsFile="${target.knownHosts}"`,
    "-o", "GlobalKnownHostsFile=/dev/null",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "HashKnownHosts=no",
    "-o", `HostKeyAlias=${target.host}`,
  ];
}

function exitOf(child: ChildProcess) {
  return new Promise<number | "missing">((resolve) => {
    child.on("error", () => resolve("missing"));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function sshFound(code: number | "missing") {
  if (code === "missing") fail("ssh not found", { hint: "Install an OpenSSH client" });
  return code;
}

export function spawnSsh(target: SshTarget, remote: string, options: { terminal: boolean; stdio: StdioOptions }) {
  const child = spawn("ssh", [...sshOptions(target), ...(options.terminal ? ["-t"] : []), `${target.user}@${target.host}`, remote], {
    stdio: options.stdio,
  });
  const exit = exitOf(child);

  return { child, exited: async () => sshFound(await exit) };
}

export async function runOverSsh(
  target: SshTarget,
  input: string | { file: string },
  onLine: (line: string) => void,
  options: SshOptions = {},
) {
  const destination = `${target.user}@${target.host}`;

  const child = spawn("ssh", [...sshOptions(target), destination, options.command ?? "bash -s"], { stdio: ["pipe", "pipe", "pipe"] });
  const exit = exitOf(child);

  let hostKeyRefused = false;
  const errors = (async () => {
    for await (const line of createInterface({ input: child.stderr })) {
      if (line.startsWith("Host key verification failed")) hostKeyRefused = true;
      process.stderr.write(`${line}\n`);
    }
  })();

  // ssh exits without reading the script when it refuses the host key, and the write must not crash the CLI
  child.stdin.on("error", () => {});
  if (typeof input === "string") child.stdin.end(input);
  else createReadStream(input.file).pipe(child.stdin);
  for await (const line of createInterface({ input: child.stdout })) onLine(line);

  const code = await exit;
  await errors;

  sshFound(code);
  if (hostKeyRefused) {
    fail(`The SSH host key of ${target.host} is not the one pinned in ${KNOWN_HOSTS_FILE}`, {
      hint: `If you rebuilt the server, remove its line from ${KNOWN_HOSTS_FILE} and run server:setup again. Otherwise do not connect.`,
    });
  }
  if (code !== 0) fail(`${options.failure ?? "The setup failed"} on ${destination} (exit code ${code})`);
}

export function uploadOverSsh(target: SshTarget, file: string, destination: string) {
  return runOverSsh(target, { file }, () => {}, {
    command: `cat > ${shellQuote(destination)}`,
    failure: `The upload of ${file} failed`,
  });
}
