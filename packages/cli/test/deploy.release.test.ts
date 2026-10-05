import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { c as createTar } from "tar";
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { startCli } from "@nuxvel/test-helpers/cli";
import { run } from "@nuxvel/test-helpers/run";
import { TEST_COMPOSE_FILE, TEST_COMPOSE_PROJECT, TEST_MAILPIT_URL } from "@nuxvel/test-helpers/services";
import { ecosystemFile } from "../src/deploy/ecosystem.ts";
import { rotateScript } from "../src/server/rotate-script.ts";
import { shellScriptOf } from "../src/server/shell-script.ts";
import { clearEnvAfterTest, hostArch, server, writeDeployConfig } from "./helpers/deploy-config.ts";
import { cliDir, runCliInTtyWithEnv, runCliWithEnv, runCliWithInput, stripAnsi } from "./helpers/run.ts";
import { scratchDir } from "./helpers/scratch.ts";
import { waitFor } from "./helpers/services.ts";

function setUpServerImage(fixturesDir: string) {
  const hash = createHash("sha256");
  const sources = ["server", "deploy"].flatMap((dir) =>
    readdirSync(join(cliDir, "src", dir), { recursive: true, encoding: "utf8" }).map((file) => join("src", dir, file)),
  );

  for (const file of [join("test", "fixtures", "ubuntu-server.Dockerfile"), ...sources].sort()) {
    if (statSync(join(cliDir, file)).isFile()) hash.update(file).update(readFileSync(join(cliDir, file)));
  }
  // The week in the key installs from the network again each week, so a broken upstream package repo still shows
  hash.update(String(Math.floor(Date.now() / 604_800_000)));

  return `nuxvel-test-ubuntu-server:set-up-${hash.digest("hex").slice(0, 16)}`;
}

describe("nuxvel server:setup", () => {
  const fixturesDir = join(cliDir, "test", "fixtures");
  const setUpImage = setUpServerImage(fixturesDir);
  let container: string;
  let cachedRecoveryKey: string | undefined;

  beforeAll(async () => {
    const recoveryKeyLabel = '{{index .Config.Labels "nuxvel.recovery-key"}}';
    const cached = await run("docker", ["image", "inspect", "-f", recoveryKeyLabel, setUpImage], process.cwd());
    cachedRecoveryKey = cached.exitCode === 0 ? cached.stdout.trim() : undefined;

    const image = cachedRecoveryKey ? setUpImage : "nuxvel-test-ubuntu-server";
    if (!cachedRecoveryKey) {
      const built = await run(
        "docker",
        ["build", "-q", "-t", image, "-f", join(fixturesDir, "ubuntu-server.Dockerfile"), fixturesDir],
        process.cwd(),
      );
      expect(built.exitCode, built.output).toBe(0);
    }

    const hostCa = process.env.SSL_CERT_FILE
      ? ["-v", `${process.env.SSL_CERT_FILE}:/usr/local/share/ca-certificates/host.crt:ro`]
      : [];
    const started = await run(
      "docker",
      ["run", "-d", "--rm", "--privileged", "-e", "NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt"]
        .concat(hostCa, image),
      process.cwd(),
    );
    expect(started.exitCode, started.output).toBe(0);
    container = started.stdout.trim();
    // A proxy that re-signs TLS (a company or sandbox proxy) must be trusted by the server's apt and npm too
    if (hostCa.length > 0) await onServer("update-ca-certificates");
    // The image of a set-up server keeps its files but not its iptables rules, so load them as a boot does
    if (cachedRecoveryKey) expect((await onServer("/usr/lib/ufw/ufw-init start")).exitCode).toBe(0);
  }, 300000);

  afterAll(async () => {
    await run("docker", ["rm", "-f", container], process.cwd());
  });

  function appWithFakeSsh(
    options: {
      label?: string;
      cpus?: string;
      app?: string;
      user?: string;
      arch?: string;
      domains?: string[];
      redirects?: Record<string, string>;
      filesDomain?: string;
      processes?: { web: number; worker: number };
      deploy?: { hold: number; strategy?: string };
      alerts?: { email?: string; smtp?: string; webhook?: string; heartbeat?: string };
      logs?: { sink: Record<string, unknown> };
      backups?: { offsite?: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }; restoreDrill?: boolean };
    } = {},
  ) {
    const dir = scratchDir(options.label ?? "server-setup");
    const bin = join(dir, "bin");

    mkdirSync(bin);
    writeFileSync(
      join(bin, "ssh"),
      `#!/bin/sh
shift $(($# - 2))
echo "ssh to $1" >&2
exec docker exec -i -u "\${1%@*}" -w / ${container} ${options.cpus ? `taskset -c ${options.cpus} ` : ""}sh -c "$2"
`,
    );
    chmodSync(join(bin, "ssh"), 0o755);
    writeDeployConfig(
      dir,
      JSON.stringify({
        servers: [{ ...server, user: options.user ?? server.user }],
        arch: options.arch ?? hostArch,
        domains: options.domains ?? ["tasks.example.com"],
        redirects: options.redirects,
        filesDomain: options.filesDomain,
        processes: options.processes,
        deploy: options.deploy,
        alerts: options.alerts,
        logs: options.logs,
        backups: options.backups,
      }),
      options.app,
    );
    writeFileSync(join(dir, ".nvmrc"), "24\n");

    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };

    const command = async (name: string, ...args: string[]) => {
      const { stdout, stderr, exitCode } = await runCliWithEnv(dir, env, name, ...args);
      return { output: stripAnsi(stdout + stderr), exitCode };
    };
    const setup = (...args: string[]) => command("server:setup", ...args);

    const setupInTty = async (answers: [prompt: string, answer: string][], ...args: string[]) => {
      const { output, exitCode } = await runCliInTtyWithEnv(dir, env, answers, "server:setup", ...args);
      return { output: stripAnsi(output), exitCode };
    };

    const destroyApp = async (answers: [prompt: string, answer: string][]) => {
      const { output, exitCode } = await runCliInTtyWithEnv(dir, env, answers, "app:destroy", "production");
      return { output: stripAnsi(output), exitCode };
    };

    return Object.assign(setup, {
      dir,
      env,
      inTty: setupInTty,
      createApp: (...args: string[]) => command("app:create", ...args),
      deploy: (...args: string[]) => command("deploy", ...args),
      rollback: (...args: string[]) => command("rollback", ...args),
      contract: (...args: string[]) => command("db:contract", ...args),
      tinker: (...args: string[]) => command("tinker", ...args),
      down: (...args: string[]) => command("down", ...args),
      up: (...args: string[]) => command("up", ...args),
      maintenanceStatus: (...args: string[]) => command("maintenance:status", ...args),
      releases: (...args: string[]) => command("releases", ...args),
      unlock: (...args: string[]) => command("deploy:unlock", ...args),
      envPull: (...args: string[]) => command("env:pull", ...args),
      envPush: (...args: string[]) => command("env:push", ...args),
      status: (...args: string[]) => command("status", ...args),
      logs: (...args: string[]) => command("logs", ...args),
      serverStatus: (...args: string[]) => command("server:status", ...args),
      upgrade: (...args: string[]) => command("server:upgrade", ...args),
      backup: (...args: string[]) => command("db:backup", ...args),
      restore: (...args: string[]) => command("db:restore", ...args),
      serverRestore: (...args: string[]) => command("server:restore", ...args),
      drCheck: (...args: string[]) => command("dr:check", ...args),
      alertsTest: (...args: string[]) => command("alerts:test", ...args),
      rotate: (...args: string[]) => command("app:rotate-credentials", ...args),
      destroyApp: Object.assign(destroyApp, { withoutTty: () => command("app:destroy", "production") }),
    });
  }

  async function keepSetUpServer(recoveryKey: string) {
    const committed = await run(
      "docker",
      ["commit", "--change", `LABEL nuxvel.recovery-key=${recoveryKey}`, container, setUpImage],
      process.cwd(),
    );
    expect(committed.exitCode, committed.output).toBe(0);

    const tags = await run("docker", ["images", "--format", "{{.Repository}}:{{.Tag}}", "nuxvel-test-ubuntu-server"], process.cwd());
    for (const tag of tags.stdout.split("\n").filter((tag) => tag.includes(":set-up-") && tag !== setUpImage)) {
      await run("docker", ["rmi", tag], process.cwd());
    }
  }

  async function onServer(command: string) {
    const { stdout, stderr, exitCode } = await run("docker", ["exec", container, "sh", "-c", command], process.cwd());
    return { output: stdout + stderr, exitCode };
  }

  function loadDotDotEntry(dir: string) {
    return loadEntry(dir, "..", true);
  }

  function loadEntry(dir: string, name: string, hardLink = false) {
    const field = (tag: number, bytes: Buffer) => Buffer.concat([Buffer.from([tag, bytes.length]), bytes]);
    const attributes = Buffer.from([0x08, hardLink ? 0x04 : 0x00, 0x10, 0x80, 0xf7, 0xc4, 0xd5, 0x06, 0x18, 0xa4, 0x03]);
    const entry = Buffer.concat([
      field(0x0a, Buffer.from(name)),
      field(0x22, attributes),
      ...(hardLink ? [field(0x4a, Buffer.from("dots"))] : []),
    ]);
    const full = Buffer.concat([field(0x0a, Buffer.from(dir)), field(0x12, entry)]);
    const frame = Buffer.concat([Buffer.alloc(4), full]);
    frame.writeUInt32BE(full.length);
    // weed shell drops the last entry of fs.meta.load, so the entry goes in twice
    const meta = Buffer.concat([frame, frame]).toString("base64");
    return `echo ${meta} | base64 -d > /tmp/dotdot.meta && echo 'fs.meta.load /tmp/dotdot.meta' | weed shell -master=127.0.0.1:9333 > /dev/null && rm /tmp/dotdot.meta`;
  }

  async function uploadBundle(bucket: string, app: string, files: Record<string, string>, links: Record<string, string> = {}) {
    const uploaded = await onServer(
      [
        "rm -rf /tmp/forged && mkdir -p /tmp/forged/shared && cd /tmp/forged",
        ...Object.entries(files).map(([name, contents]) => `echo ${Buffer.from(contents).toString("base64")} | base64 -d > ${name}`),
        ...Object.entries(links).map(([name, target]) => `ln -s ${target} ${name}`),
        "set -a && . /etc/nuxvel/offsite.env && set +a",
        `tar -c . | age -R /etc/nuxvel/recovery.pub | rclone rcat 'offsite:${bucket}/${app}/config-29990101T000000Z.tar.age'`,
        `echo junk | rclone rcat 'offsite:${bucket}/${app}/database-29990101T000000Z.dump.age'`,
      ].join(" && "),
    );
    expect(uploaded.exitCode, uploaded.output).toBe(0);
  }

  it("shows the changes with --dry-run, sets up the base system, then changes nothing on a second run", async () => {
    const setup = appWithFakeSsh();

    const ramMb = Number((await onServer("awk '/^MemTotal:/ { print int($2 / 1024 / 256) * 256 }' /proc/meminfo")).output);
    const postgresMb = Math.floor(ramMb / 4);
    const redisMb = Math.floor(ramMb / 10);
    const servicesMb = Math.floor(ramMb / 20);
    const recoveryKey = cachedRecoveryKey ?? (await setUpFreshServer());

    async function setUpFreshServer() {
      const dryRun = await setup("production", "--dry-run");
      expect(dryRun.exitCode, dryRun.output).toBe(0);
      expect(dryRun.output).toContain("ssh to root@203.0.113.10");
      expect(dryRun.output).toContain(
        `Memory budget of ${ramMb} MB: Postgres ${postgresMb} MB, Redis ${redisMb} MB, ` +
          `SeaweedFS and Caddy ${servicesMb} MB, app processes ${ramMb - postgresMb - redisMb - servicesMb} MB`,
      );
      for (const change of [
        "~ create /srv/nuxvel",
        "~ set the time zone to UTC",
        "~ create a 2 GB swap file",
        "~ create the user deploy",
        "~ let deploy run only caddy-site, erasure and assets in /usr/local/lib/nuxvel/ with sudo",
        "~ allow SSH with keys only, and root with a key only",
        "~ install fail2ban",
        "~ allow port 443 in the firewall",
        "~ turn on the firewall",
        "~ install security updates every day",
        "~ install needrestart",
        "~ install Node.js 24",
        "~ install pm2",
        "~ start pm2 as deploy on boot",
        "~ rotate the pm2 logs daily",
        "~ install Caddy",
        "~ serve the app sites in /etc/caddy/sites/ with Caddy",
        "~ write /usr/local/lib/nuxvel/caddy-site",
        "~ write /usr/local/lib/nuxvel/assets",
        "~ install Postgres 18",
        "~ install Redis",
        "~ turn off the default Redis instance",
        "~ create the admin user of Redis durable",
        "~ run Redis durable on localhost:6379",
        "~ run Redis cache on localhost:6380",
        "~ install SeaweedFS 4.47",
        "~ give each new bucket of SeaweedFS one volume",
        "~ let only root and seaweedfs reach the SeaweedFS filer, volume and master on localhost",
        "~ run SeaweedFS with S3 on localhost:8333",
        "~ delete the expired files of every bucket each hour with the timer nuxvel-storage-lifecycle",
        "~ install age",
        "~ make the recovery key",
        "~ write /usr/local/lib/nuxvel/backup",
        "~ write /usr/local/lib/nuxvel/restore",
        "~ write /usr/local/lib/nuxvel/erasure",
        "~ write /usr/local/lib/nuxvel/monitor",
        "~ watch the server and its apps every minute with the timer nuxvel-monitor",
        "~ rotate the logs in /var/log/nuxvel weekly",
        "~ serve the Prometheus metrics of the monitor on 127.0.0.1:9470",
        "~ back up every app each night with the timer nuxvel-backup",
        "~ write the server registry /srv/nuxvel/server.json",
      ]) {
        expect(dryRun.output).toContain(change);
      }
      expect(dryRun.output).toContain("Add these URLs to an external uptime service, such as UptimeRobot or Better Stack:");
      expect(dryRun.output).toContain("\n  https://tasks.example.com/api/health/ready\n");
      expect(dryRun.output).toMatch(/Dry run: \d+ changes to make on root@203\.0\.113\.10, nothing changed/);
      expect((await onServer("id deploy")).exitCode).toBe(1);
      const offsite = { endpoint: "http://127.0.0.1:8333", bucket: "fresh-backups", accessKeyId: "key", secretAccessKey: "secret" };
      const withTargets = await appWithFakeSsh({ alerts: { webhook: "http://127.0.0.1:4999/alerts", heartbeat: "http://127.0.0.1:4999/heartbeat" }, backups: { offsite } })(
        "production",
        "--dry-run",
      );
      expect(withTargets.exitCode, withTargets.output).toBe(0);
      expect(withTargets.output).toContain("~ upload the backups to the off-site bucket fresh-backups");
      expect(withTargets.output).toContain("~ send the alerts to the webhook, a heartbeat to the heartbeat URL\n");

      const first = await setup.inTty([["stored outside the server?", "y"]], "production");
      expect(first.exitCode, first.output).toBe(0);
      expect(first.output).toMatch(/Made \d+ changes on root@203\.0\.113\.10/);
      expect(first.output).toContain("Recovery key, shown this one time");

      const shownKey = /AGE-SECRET-KEY-1[0-9A-Z]+/.exec(first.output)?.[0];
      if (!shownKey) throw new Error(`server:setup showed no recovery key:\n${first.output}`);
      await keepSetUpServer(shownKey);

      return shownKey;
    }

    expect((await onServer("readlink /etc/localtime")).output).toContain("zoneinfo/Etc/UTC");
    expect((await onServer("stat -c '%a %s' /swapfile; grep swapfile /etc/fstab; cat /run/fake-swaps")).output).toBe(
      "600 2147483648\n/swapfile none swap sw 0 0\n/swapfile\n",
    );
    expect((await onServer("stat -c '%U %a' /home/deploy/.ssh /home/deploy/.ssh/authorized_keys")).output).toBe(
      "deploy 700\ndeploy 600\n",
    );
    expect((await onServer("cmp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys")).exitCode).toBe(0);
    expect((await onServer("passwd -S deploy")).output).toMatch(/^deploy L /);

    const sudo = (await onServer("sudo -l -U deploy")).output;
    expect(sudo).toContain("(root) NOPASSWD:");
    const deployMayRun = async (helper: string) =>
      (await onServer(`sudo -l -U deploy /usr/local/lib/nuxvel/${helper} tasks`)).exitCode;
    for (const helper of ["caddy-site", "erasure", "assets"]) expect(await deployMayRun(helper), helper).toBe(0);
    for (const helper of ["caddy-reload", "backup", "restore", "monitor", "metrics"]) {
      expect(await deployMayRun(helper), helper).toBe(1);
    }
    expect(sudo).not.toMatch(/\(ALL|: ALL/);
    expect((await onServer("stat -c '%U %a' /usr/local/lib/nuxvel /usr/local/lib/nuxvel/caddy-reload")).output).toBe(
      "root 755\nroot 755\n",
    );

    const sshd = (await onServer("sshd -T")).output;
    expect(sshd).toContain("permitrootlogin prohibit-password");
    expect(sshd).toContain("passwordauthentication no");
    expect(sshd).toContain("kbdinteractiveauthentication no");

    expect((await onServer("fail2ban-client -d")).output).toMatch(/\['add', 'sshd', 'systemd'\]/);
    expect((await onServer("systemctl is-enabled fail2ban")).output).toBe("enabled\n");
    expect((await onServer("cat /run/fake-systemctl")).output).toBe(
      "try-reload-or-restart ssh\nrestart fail2ban\nrestart caddy\nrestart postgresql\n" +
        "stop redis-server\nrestart redis-server@durable\nrestart redis-server@cache\n" +
        "try-restart seaweedfs\ntry-restart seaweedfs\ntry-restart seaweedfs\nrestart seaweedfs\nrestart nuxvel-storage-lifecycle.timer\nrestart nuxvel-backup.timer\nrestart nuxvel-monitor.timer\nrestart nuxvel-metrics\n",
    );

    const firewall = (await onServer("ufw status verbose")).output;
    expect(firewall).toContain("Status: active");
    expect(firewall).toContain("Default: deny (incoming)");
    for (const rule of firewall.split("\n").filter((line) => line.includes("ALLOW"))) {
      expect(rule).toMatch(/^(22|80|443)\/tcp /);
    }
    for (const port of ["22", "80", "443"]) expect(firewall).toMatch(new RegExp(`^${port}/tcp +ALLOW IN`, "m"));

    expect((await onServer("apt-config dump | grep Unattended-Upgrade")).output).toContain(
      'APT::Periodic::Unattended-Upgrade "1";',
    );

    expect((await onServer("node --version")).output).toMatch(/^v24\./);
    const pm2Version = "node -p \"require('/usr/lib/node_modules/pm2/package.json').version\"";
    expect((await onServer(`test -x /usr/bin/pm2 && ${pm2Version}`)).output).toMatch(/^6\./);
    const pm2Unit = "systemctl is-enabled pm2-deploy; grep -E '^(User|ExecStart)=' /etc/systemd/system/pm2-deploy.service";
    expect((await onServer(pm2Unit)).output).toBe("enabled\nUser=deploy\nExecStart=/usr/bin/pm2 resurrect\n");
    expect((await onServer("logrotate --debug /etc/logrotate.d/pm2-deploy")).exitCode).toBe(0);

    expect((await onServer("dpkg-query -W -f='${Version}' caddy")).output).toBe("2.11.4");
    expect((await onServer("ls /etc/apt/sources.list.d")).output).not.toContain("caddy");
    expect((await onServer("cat /etc/caddy/Caddyfile; stat -c %F /etc/caddy/sites")).output).toBe(
      "{\n\tadmin unix//var/lib/caddy/admin.sock|0600\n}\nimport /etc/caddy/sites/*.caddy\ndirectory\n",
    );

    onTestFinished(async () => {
      await onServer("pkill -x caddy; rm -f /var/lib/nuxvel/monitor.json /var/log/nuxvel/monitor.log");
    });
    const realCaddy = await onServer(
      "cd /var/lib/caddy && runuser -u caddy -- env HOME=/var/lib/caddy caddy start --config /etc/caddy/Caddyfile 2>&1",
    );
    expect(realCaddy.exitCode, realCaddy.output).toBe(0);
    expect((await onServer("curl -s --max-time 5 http://127.0.0.1:2019/config/")).exitCode).toBe(7);
    const asDeploy = "runuser -u deploy -- curl -s --max-time 5 --unix-socket /var/lib/caddy/admin.sock http://localhost/config/";
    expect((await onServer(asDeploy)).exitCode).toBe(7);
    const graceful = await onServer(
      "cd /var/lib/caddy && runuser -u caddy -- env HOME=/var/lib/caddy caddy reload --config /etc/caddy/Caddyfile --force 2>&1",
    );
    expect(graceful.exitCode, graceful.output).toBe(0);
    await onServer("/usr/local/lib/nuxvel/monitor");
    expect((await onServer("grep 'service=\"caddy\"' /var/lib/nuxvel-metrics/metrics.prom")).output).toBe(
      'nuxvel_service_up{service="caddy"} 1\n',
    );
    const socketCurl = "curl -s --max-time 5 --unix-socket /var/lib/caddy/admin.sock http://localhost/config/";
    await onServer(`pkill -x caddy; timeout 10 sh -c 'while ${socketCurl}; do sleep 0.1; done'`);
    expect((await onServer(socketCurl)).exitCode).toBe(7);

    const settings =
      "show listen_addresses; show max_connections; show shared_buffers; show effective_cache_size; show shared_preload_libraries; show log_min_duration_statement";
    const postgres = await onServer(`pg_ctlcluster 18 main start && su postgres -c "psql -tAc '${settings}'"`);
    expect(postgres.output).toBe(`localhost\n100\n${Math.floor(ramMb / 8)}MB\n${Math.floor(ramMb / 2)}MB\npg_stat_statements\n500ms\n`);
    expect((await onServer("psql -h 127.0.0.1 -U postgres -w -c 'select 1'")).output).toContain(
      "fe_sendauth: no password supplied",
    );

    expect((await onServer("systemctl is-enabled redis-server; systemctl is-enabled redis-server@durable")).output).toBe(
      "disabled\nenabled\n",
    );
    async function redisConfig(name: string, port: number, ...keys: string[]) {
      const { output } = await onServer(
        `install -d -o redis -g redis /run/redis-${name} && ` +
          `su redis -s /bin/sh -c 'redis-server /etc/redis/redis-${name}.conf --daemonize yes' && ` +
          `export REDISCLI_AUTH=$(cat /etc/nuxvel/redis-${name}.password) && ` +
          `until redis-cli -p ${port} --user nuxvel ping >/dev/null 2>&1; do sleep 0.1; done && ` +
          `redis-cli -p ${port} --user nuxvel config get ${keys.join(" ")}`,
      );
      const lines = output.split("\n");
      return Object.fromEntries(keys.map((key) => [key, lines[lines.indexOf(key) + 1]]));
    }

    const maxmemory = String(Math.floor(ramMb / 20) * 1024 * 1024);
    expect(await redisConfig("durable", 6379, "bind", "maxmemory", "maxmemory-policy", "appendonly")).toEqual({
      bind: "127.0.0.1 -::1",
      maxmemory,
      "maxmemory-policy": "noeviction",
      appendonly: "yes",
    });
    expect(await redisConfig("cache", 6380, "bind", "maxmemory", "maxmemory-policy", "appendonly", "save")).toEqual({
      bind: "127.0.0.1 -::1",
      maxmemory,
      "maxmemory-policy": "allkeys-lru",
      appendonly: "no",
      save: "",
    });
    expect((await onServer("redis-cli -p 6379 ping; redis-cli -p 6380 ping")).output.match(/NOAUTH/g)).toHaveLength(2);
    const passwords = (await onServer("stat -c '%U %a' /etc/nuxvel/redis-*.password; cat /etc/nuxvel/redis-*.password")).output;
    const [cacheOwner, durableOwner, cachePassword, durablePassword] = passwords.trim().split("\n");
    expect([cacheOwner, durableOwner]).toEqual(["root 600", "root 600"]);
    expect(cachePassword).toMatch(/^[0-9a-f]{64}$/);
    expect(durablePassword).not.toBe(cachePassword);
    expect((await onServer("cat /etc/redis/*.acl")).output).not.toContain(cachePassword);

    expect((await onServer("systemctl is-enabled seaweedfs; stat -c '%U %a' /srv/nuxvel/storage /etc/nuxvel/seaweedfs.env")).output)
      .toBe("enabled\nseaweedfs 700\nroot 600\n");
    const s3 = await onServer(
      "set -a && . /etc/nuxvel/seaweedfs.env && set +a && " +
        "sh -c \"$(sed -n 's/^ExecStartPre=+//p' /etc/systemd/system/seaweedfs.service)\" && " +
        "command=$(sed -n 's/^ExecStart=//p' /etc/systemd/system/seaweedfs.service) && " +
        "(setsid su seaweedfs -s /bin/sh -c \"$command\" >/tmp/weed.log 2>&1 &) && " +
        "until curl -s -o /dev/null http://127.0.0.1:8333; do sleep 0.1; done && " +
        "curl -s -o /dev/null -w '%{http_code} ' -X PUT http://127.0.0.1:8333/anonymous && " +
        "curl -s -o /dev/null -w '%{http_code}\\n' -X PUT --aws-sigv4 aws:amz:us-east-1:s3 " +
        "--user \"$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY\" http://127.0.0.1:8333/admin-bucket && " +
        "ss -ltnpH | grep -c weed && " +
        "ss -ltnpH | grep weed | awk '{ print $4 }' | grep -v '^127\\.0\\.0\\.1:' | wc -l && " +
        "find /srv/nuxvel/storage -type f | wc -l",
    );
    const [status, listeners, publicListeners, storedFiles] = s3.output.trim().split("\n");
    expect(status).toBe("403 200");
    expect(Number(listeners)).toBeGreaterThanOrEqual(4);
    expect(publicListeners).toBe("0");
    expect(Number(storedFiles)).toBeGreaterThan(0);

    const ownerKeys = "set -a && . /etc/nuxvel/seaweedfs.env && set +a";
    const probe = "http://127.0.0.1:8888/buckets/admin-bucket/probe.txt";
    const put = await onServer(
      `${ownerKeys} && echo probe > /tmp/probe.txt && curl -s -o /dev/null -w '%{http_code}' -X PUT --aws-sigv4 aws:amz:us-east-1:s3 ` +
        '--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" -T /tmp/probe.txt http://127.0.0.1:8333/admin-bucket/probe.txt',
    );
    expect(put.output).toBe("200");
    const internalPorts = (
      await onServer("ss -ltnpH | grep weed | awk '{ print $4 }' | sed 's/.*://' | grep -v '^8333$' | sort -u")
    ).output.trim().split("\n");
    expect(internalPorts.length).toBeGreaterThanOrEqual(3);
    for (const user of ["nobody", "deploy"]) {
      for (const port of internalPorts) {
        const refused = await onServer(`runuser -u ${user} -- curl -s --max-time 5 http://127.0.0.1:${port}/`);
        expect(refused.exitCode, `${user} reached port ${port}`).toBe(7);
      }
    }
    expect((await onServer(`runuser -u nobody -- curl -s --max-time 5 ${probe}`)).exitCode).not.toBe(0);
    expect((await onServer("runuser -u nobody -- curl -s --max-time 5 http://127.0.0.1:8888/etc/iam/")).exitCode).not.toBe(0);
    expect(
      (await onServer("echo s3.user.list | runuser -u nobody -- timeout 20 weed shell -master=127.0.0.1:9333")).output,
    ).not.toContain("admin");
    expect((await onServer(`curl -s -o /dev/null -w '%{http_code}' ${probe}`)).output).toBe("200");
    expect(
      (await onServer("runuser -u deploy -- curl -s -o /dev/null -w '%{http_code}' -X PUT http://127.0.0.1:8333/anonymous2")).output,
    ).toBe("403");

    expect((await onServer("cat /etc/nuxvel/recovery.pub; ls /etc/nuxvel")).output).toMatch(
      /^age1[0-9a-z]+\nrecovery\.pub\nredis-cache\.password\nredis-durable\.password\nseaweedfs\.env\nseaweedfs\.nft\n$/,
    );
    expect((await onServer("grep -rl AGE-SECRET-KEY /etc /srv/nuxvel /root")).output).toBe("");
    const decrypted = await onServer(
      `printf '%s\\n' '${recoveryKey}' > /tmp/recovery.key && echo backup | age -R /etc/nuxvel/recovery.pub | ` +
        "age -d -i /tmp/recovery.key; rm /tmp/recovery.key",
    );
    expect(decrypted.output).toBe("backup\n");

    const registry = JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output);
    expect(registry).toEqual({
      node: expect.stringMatching(/^24\./),
      cpus: Number((await onServer("nproc")).output),
      services: {
        postgres: { version: 18, port: 5432, maxConnections: 100 },
        redis: { durable: { port: 6379 }, cache: { port: 6380 } },
        seaweedfs: { version: "4.47", s3Port: 8333 },
        caddy: { sites: "/etc/caddy/sites" },
        pm2: { version: 6 },
      },
      memory: { totalMb: ramMb, postgresMb, redisMb, servicesMb, appsMb: ramMb - postgresMb - redisMb - servicesMb },
      apps: {},
    });
    expect((await onServer("stat -c '%U %a' /srv/nuxvel/server.json")).output).toBe("root 644\n");
    const otherApp = { folder: "/srv/apps/other", ports: { blue: [3000, 3009], green: [3010, 3019] } };
    const withApp = JSON.stringify({ ...registry, apps: { other: otherApp } }, null, 2);
    await onServer(`printf '%s\\n' '${withApp}' > /srv/nuxvel/server.json`);

    const second = await setup("production");
    expect(second.exitCode, second.output).toBe(0);
    expect(second.output).not.toContain("~ ");
    expect(second.output).toContain("root@203.0.113.10 is set up, nothing to change");
    expect(JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output).apps).toEqual({ other: otherApp });
  }, 1200000);

  it("creates the app's folder and a free block of 20 ports, then changes nothing on a second run", async () => {
    const tasks = appWithFakeSsh();

    const dryRun = await tasks.createApp("production", "--dry-run");
    expect(dryRun.exitCode, dryRun.output).toBe(0);
    expect(dryRun.output).toContain("ssh to root@203.0.113.10");
    expect(dryRun.output).toContain("~ create /srv/apps/tasks");
    expect(dryRun.output).toContain("~ record tasks in the server registry /srv/nuxvel/server.json");
    expect(dryRun.output).toContain("~ create /srv/apps/tasks/releases");
    expect(dryRun.output).toContain("~ create /srv/apps/tasks/shared, which only deploy may read");
    expect(dryRun.output).toContain("~ create /srv/nuxvel/assets/tasks/_nuxt, which only root may write and Caddy may read");
    expect(dryRun.output).toContain("~ write /srv/apps/tasks/state.json with no release yet");
    expect(dryRun.output).toContain("~ set NUXT_SITE_URL=https://tasks.example.com in /srv/apps/tasks/shared/.env");
    expect(dryRun.output).toContain("~ set a random NUXT_AUDIT_CHAIN_SECRET in /srv/apps/tasks/shared/.env");
    expect(dryRun.output).toContain("~ set a random NUXT_OG_IMAGE_SECRET in /srv/apps/tasks/shared/.env");
    expect(dryRun.output).toContain("Ports of tasks on localhost: blue 3020-3029, green 3030-3039");
    expect(dryRun.output).toMatch(/Dry run: \d+ changes to make on root@203\.0\.113\.10, nothing changed/);
    expect((await onServer("ls /srv/apps/tasks")).exitCode).not.toBe(0);
    expect(JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output).apps.tasks).toBeUndefined();

    const first = await tasks.createApp("production");
    expect(first.exitCode, first.output).toBe(0);
    expect(first.output).toMatch(/Made \d+ changes on root@203\.0\.113\.10/);
    expect((await onServer("stat -c '%U %a' /srv/apps /srv/apps/tasks")).output).toBe("root 755\ndeploy 750\n");
    const app = "/srv/apps/tasks";
    expect((await onServer(`cd ${app} && stat -c '%n %U %a' releases shared state.json /srv/nuxvel/assets/tasks /srv/nuxvel/assets/tasks/_nuxt`)).output).toBe(
      "releases deploy 700\nshared deploy 700\nstate.json deploy 600\n/srv/nuxvel/assets/tasks root 755\n/srv/nuxvel/assets/tasks/_nuxt root 755\n",
    );
    expect((await onServer(`ls ${app}/shared/assets`)).exitCode).not.toBe(0);
    expect(JSON.parse((await onServer(`cat ${app}/state.json`)).output)).toEqual({
      active: null,
      releases: { blue: null, green: null },
      contractMigrations: [],
    });
    const asCaddy = (command: string) => onServer(`runuser -u caddy -- ${command} 2>&1`);
    const added = await onServer(
      `runuser -u deploy -- sh -c 'cd $(mktemp -d) && echo "console.log(1)" > entry.abc123.js && tar -c . | sudo -n /usr/local/lib/nuxvel/assets tasks add'`,
    );
    expect(added.exitCode, added.output).toBe(0);
    expect((await asCaddy("cat /srv/nuxvel/assets/tasks/_nuxt/entry.abc123.js")).output).toBe("console.log(1)\n");
    expect((await asCaddy(`cat ${app}/shared/.env`)).output).toContain("Permission denied");
    expect((await asCaddy(`ls ${app}/shared`)).output).toContain("Permission denied");
    expect((await asCaddy(`ls ${app}/releases`)).output).toContain("Permission denied");
    await onServer(`sed -i 's/"active": null/"active": "blue"/' ${app}/state.json`);

    const second = await tasks.createApp("production");
    expect(second.exitCode, second.output).toBe(0);
    expect(second.output).not.toContain("~ ");
    expect(second.output).toContain("Ports of tasks on localhost: blue 3020-3029, green 3030-3039");
    expect(second.output).toContain("tasks on root@203.0.113.10 is set up, nothing to change");
    expect(JSON.parse((await onServer(`cat ${app}/state.json`)).output).active).toBe("blue");

    const notes = await appWithFakeSsh({ app: "notes" }).createApp("production");
    expect(notes.exitCode, notes.output).toBe(0);
    expect(notes.output).toContain("Ports of notes on localhost: blue 3040-3049, green 3050-3059");

    const { apps } = JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output);
    expect(apps.other).toEqual({ folder: "/srv/apps/other", ports: { blue: [3000, 3009], green: [3010, 3019] } });
    expect(apps.tasks).toEqual({
      folder: "/srv/apps/tasks",
      domains: ["tasks.example.com"],
      redirects: {},
      filesDomain: null,
      ports: { blue: [3020, 3029], green: [3030, 3039] },
      pm2: { blue: ["tasks-web-blue", "tasks-worker-blue"], green: ["tasks-web-green", "tasks-worker-green"] },
      database: { name: "tasks", owner: "tasks_owner", runtime: "tasks_app" },
      redis: { user: "tasks", prefix: "tasks:", instances: ["durable", "cache"] },
      buckets: { user: "tasks", private: "tasks-private", public: "tasks-public" },
      timers: ["nuxvel-tasks-maintenance.timer"],
    });
    expect(apps.notes.ports).toEqual({ blue: [3040, 3049], green: [3050, 3059] });

    await onServer("mv /srv/nuxvel/server.json /tmp/server.json");
    const notSetUp = await tasks.createApp("production");
    await onServer("mv /tmp/server.json /srv/nuxvel/server.json");
    expect(notSetUp.exitCode).toBe(1);
    expect(notSetUp.output).toContain("This server is not set up by nuxvel, /srv/nuxvel/server.json is missing");
    expect(notSetUp.output).toContain("Run nuxvel server:setup first");
  }, 120000);

  it("gives each app its own database, with an owner role for migrations and a runtime role with data rights only", async () => {
    const dryRun = await appWithFakeSsh({ app: "time-off" }).createApp("production", "--dry-run");
    expect(dryRun.exitCode, dryRun.output).toBe(0);
    expect(dryRun.output).toContain("~ create the database role time_off_owner, its URL in /srv/apps/time-off/shared/owner.env");
    expect(dryRun.output).toContain("~ create the database role time_off_app, its URL in /srv/apps/time-off/shared/.env");
    expect(dryRun.output).toContain("~ create the database time_off, owned by time_off_owner, with data rights for time_off_app");

    const shared = "/srv/apps/tasks/shared";
    expect((await onServer(`stat -c '%U %a' ${shared} ${shared}/.env ${shared}/owner.env`)).output).toBe(
      "deploy 700\ndeploy 600\ndeploy 600\n",
    );
    const runtimeUrl = (await onServer(`cat ${shared}/.env`)).output;
    const ownerUrl = (await onServer(`cat ${shared}/owner.env`)).output;
    expect(runtimeUrl).toMatch(/^NUXT_DATABASE_URL=postgres:\/\/tasks_app:[0-9a-f]{64}@127\.0\.0\.1:5432\/tasks\n/m);
    expect(ownerUrl).toMatch(/^NUXT_DATABASE_OWNER_URL=postgres:\/\/tasks_owner:[0-9a-f]{64}@127\.0\.0\.1:5432\/tasks\n$/);

    const asRole = (file: string, sql: string) =>
      onServer(`. ${shared}/${file} && psql "\${NUXT_DATABASE_OWNER_URL:-$NUXT_DATABASE_URL}" -X -q -tA -c "${sql}" 2>&1`);
    expect((await asRole("owner.env", "create table task (id serial primary key, title text)")).exitCode).toBe(0);
    expect((await asRole(".env", "insert into task (title) values ('Ship') returning id")).output).toBe("1\n");
    expect((await asRole(".env", "select title from task")).output).toBe("Ship\n");
    expect((await asRole(".env", "create table note (id int)")).output).toContain("permission denied for schema public");
    expect((await asRole(".env", "drop table task")).output).toContain("must be owner of table task");

    const notesPassword = /notes_app:([0-9a-f]{64})@/.exec((await onServer("cat /srv/apps/notes/shared/.env")).output)?.[1];
    const crossApp = await onServer(`psql postgres://notes_app:${notesPassword}@127.0.0.1:5432/tasks -X -c 'select 1' 2>&1`);
    expect(crossApp.output).toContain('permission denied for database "tasks"');

    const again = await appWithFakeSsh().createApp("production");
    expect(again.output).toContain("tasks on root@203.0.113.10 is set up, nothing to change");
    expect((await onServer(`cat ${shared}/.env`)).output).toBe(runtimeUrl);
  }, 120000);

  it("gives each app a Redis user on both instances that reaches only the keys and channels under its prefix", async () => {
    const dryRun = await appWithFakeSsh({ app: "billing" }).createApp("production", "--dry-run");
    expect(dryRun.output).toContain("~ create the Redis user billing on durable for the keys billing:*, its URL in /srv/apps/billing/shared/.env");
    expect(dryRun.output).toContain("~ create the Redis user billing on cache for the keys billing:*, its URL in /srv/apps/billing/shared/.env");
    expect(dryRun.output).toContain("~ set NUXT_REDIS_PREFIX=billing: in /srv/apps/billing/shared/.env");

    const env = (await onServer("cat /srv/apps/tasks/shared/.env")).output;
    expect(env).toMatch(/^NUXT_REDIS_URL=redis:\/\/tasks:[0-9a-f]{64}@127\.0\.0\.1:6379\/0$/m);
    expect(env).toMatch(/^NUXT_REDIS_CACHE_URL=redis:\/\/tasks:[0-9a-f]{64}@127\.0\.0\.1:6380\/0$/m);
    expect(env).toMatch(/^NUXT_REDIS_PREFIX=tasks:$/m);
    expect(env).toMatch(/^NUXT_SITE_URL=https:\/\/tasks\.example\.com$/m);
    expect(env).toMatch(/^NUXT_AUDIT_CHAIN_SECRET=[0-9a-f]{64}$/m);
    expect(env).toMatch(/^NUXT_OG_IMAGE_SECRET=[0-9a-f]{64}$/m);
    const durablePassword = /NUXT_REDIS_URL=redis:\/\/tasks:([0-9a-f]{64})@/.exec(env)?.[1] ?? "";
    expect((await onServer("cat /etc/redis/durable.acl /etc/redis/cache.acl")).output).not.toContain(durablePassword);

    const asApp = async (app: string, variable: string, command: string) =>
      (await onServer(`. /srv/apps/${app}/shared/.env && redis-cli --no-auth-warning -u "$${variable}" ${command} 2>&1`)).output.trim();
    for (const variable of ["NUXT_REDIS_URL", "NUXT_REDIS_CACHE_URL"]) {
      expect(await asApp("tasks", variable, "set tasks:nuxvel:cache:posts 1")).toBe("OK");
      expect(await asApp("tasks", variable, "eval \"return redis.call('incr', KEYS[1])\" 1 tasks:bull:nuxvel:id")).toBe("1");
      expect(await asApp("tasks", variable, "publish tasks:nuxvel:channel:0:posts hello")).toBe("0");
      expect(await asApp("tasks", variable, "info server")).toContain("redis_version");
      expect(await asApp("tasks", variable, "client setname tasks-web")).toBe("OK");
      expect(await asApp("tasks", variable, "get notes:nuxvel:cache:posts")).toContain("NOPERM");
      expect(await asApp("tasks", variable, "publish notes:nuxvel:channel:0:posts hello")).toContain("NOPERM");
      expect(await asApp("tasks", variable, "flushall")).toContain("NOPERM");
      expect(await asApp("notes", variable, "get tasks:nuxvel:cache:posts")).toContain("NOPERM");
    }

    const again = await appWithFakeSsh().createApp("production");
    expect(again.output).toContain("tasks on root@203.0.113.10 is set up, nothing to change");
    expect((await onServer("cat /srv/apps/tasks/shared/.env")).output).toBe(env);
  }, 120000);

  it("gives each app a private and a public bucket with its own S3 keys, CORS for its domains and a tmp/ rule", async () => {
    const dryRun = await appWithFakeSsh({ app: "billing" }).createApp("production", "--dry-run");
    for (const change of [
      "~ create the bucket billing-private",
      "~ create the bucket billing-public",
      "~ create the S3 user billing for billing-private and billing-public, its URL in /srv/apps/billing/shared/.env",
      "~ set NUXT_STORAGE_BUCKET=billing-private in /srv/apps/billing/shared/.env",
      "~ let anyone read the files of billing-public",
      "~ allow uploads and downloads from tasks.example.com in billing-private",
      "~ allow uploads and downloads from tasks.example.com in billing-public",
      "~ delete the files under tmp/ of billing-private after one day",
    ]) {
      expect(dryRun.output).toContain(change);
    }

    const env = (await onServer("cat /srv/apps/tasks/shared/.env")).output;
    expect(env).toMatch(/^NUXT_STORAGE_URL=http:\/\/[0-9a-f]{20}:[0-9a-f]{64}@127\.0\.0\.1:8333$/m);
    expect(env).toMatch(/^NUXT_STORAGE_BUCKET=tasks-private$/m);
    expect(JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output).apps.tasks.buckets).toEqual({
      user: "tasks",
      private: "tasks-private",
      public: "tasks-public",
    });

    const s3 = "http://127.0.0.1:8333";
    const status = async (curl: string) => (await onServer(`curl -s -o /dev/null -w '%{http_code}' ${curl}`)).output;
    const asApp = (app: string, curl: string) =>
      status(
        `--aws-sigv4 aws:amz:us-east-1:s3 --user "$(sed -n 's|^NUXT_STORAGE_URL=http://\\(.*\\)@.*|\\1|p' /srv/apps/${app}/shared/.env)" ${curl}`,
      );
    expect(await asApp("tasks", `-X PUT --data-binary private ${s3}/tasks-private/tmp/upload.txt`)).toBe("200");
    expect(await asApp("tasks", `${s3}/tasks-private/tmp/upload.txt`)).toBe("200");
    expect(await asApp("tasks", `-X PUT --data-binary public ${s3}/tasks-public/logo.txt`)).toBe("200");
    expect(await asApp("notes", `-X PUT --data-binary notes ${s3}/notes-private/tmp/upload.txt`)).toBe("200");
    expect(await asApp("notes", `${s3}/tasks-private/tmp/upload.txt`)).toBe("403");
    expect(await asApp("tasks", `-X PUT --data-binary x ${s3}/notes-public/logo.txt`)).toBe("403");
    expect(await asApp("tasks", `-X DELETE ${s3}/tasks-public`)).toBe("403");
    expect(await asApp("tasks", `-X PUT --data-binary '<CORSConfiguration/>' '${s3}/tasks-private?cors'`)).toBe("403");
    await onServer("echo 's3.anonymous.set -bucket tasks-private -access Read' | weed shell -master=127.0.0.1:9333");
    expect(await status(`${s3}/tasks-private/tmp/upload.txt`)).toBe("200");
    expect((await appWithFakeSsh().createApp("production")).output).toContain("~ block public access to tasks-private");
    expect(await status(`${s3}/tasks-private/tmp/upload.txt`)).toBe("403");
    expect(await status(`${s3}/tasks-public/logo.txt`)).toBe("200");
    expect(await status(`-X PUT --data-binary x ${s3}/tasks-public/anonymous.txt`)).toBe("403");
    expect(await status(`${s3}/tasks-public`)).toBe("403");

    const preflight = (origin: string) =>
      onServer(`curl -s -i -X OPTIONS -H 'Origin: ${origin}' -H 'Access-Control-Request-Method: PUT' ${s3}/tasks-private/tmp/next.txt`);
    expect((await preflight("https://tasks.example.com")).output).toMatch(/^Access-Control-Allow-Origin: https:\/\/tasks\.example\.com\r$/m);
    expect((await preflight("https://evil.example.com")).output).not.toContain("Access-Control-Allow-Origin");

    const lifecycle = await onServer(
      "set -a && . /etc/nuxvel/seaweedfs.env && " +
        `curl -s --aws-sigv4 aws:amz:us-east-1:s3 --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" '${s3}/tasks-private?lifecycle'`,
    );
    expect(lifecycle.output).toContain(
      "<ID>expire-temp-uploads</ID><Filter><Prefix>tmp/</Prefix></Filter><Status>Enabled</Status><Expiration><Days>1</Days></Expiration>",
    );

    const lifecycleUnit = "/etc/systemd/system/nuxvel-storage-lifecycle";
    expect(
      (await onServer(`systemctl is-enabled nuxvel-storage-lifecycle.timer; grep -E '^(OnCalendar|Persistent)=' ${lifecycleUnit}.timer`)).output,
    ).toBe("enabled\nOnCalendar=hourly\nPersistent=true\n");
    await onServer(loadEntry("/buckets/tasks-private/tmp", "abandoned.txt"));
    await onServer(loadEntry("/buckets/tasks-private/covers", "old.txt"));
    expect(await asApp("tasks", `-I ${s3}/tasks-private/tmp/abandoned.txt`)).toBe("200");
    const swept = await onServer(
      `field() { sed -n "s/^$1=//p" ${lifecycleUnit}.service; } && field StandardInputText | runuser -u $(field User) -- $(field ExecStart)`,
    );
    expect(swept.output).toContain("cursors checkpointed");
    expect(await asApp("tasks", `-I ${s3}/tasks-private/tmp/abandoned.txt`)).toBe("404");
    expect(await asApp("tasks", `-I ${s3}/tasks-private/tmp/upload.txt`)).toBe("200");
    expect(await asApp("tasks", `-I ${s3}/tasks-private/covers/old.txt`)).toBe("200");

    const again = await appWithFakeSsh().createApp("production");
    expect(again.output).toContain("tasks on root@203.0.113.10 is set up, nothing to change");
    expect((await onServer("cat /srv/apps/tasks/shared/.env")).output).toBe(env);
  }, 120000);

  it("runs the maintenance entry of the current release once a day, as the deploy user with the owner URL", async () => {
    const unit = "/etc/systemd/system/nuxvel-tasks-maintenance";
    expect((await onServer(`systemctl is-enabled nuxvel-tasks-maintenance.timer; grep -E '^(OnCalendar|Persistent)=' ${unit}.timer`)).output)
      .toBe("enabled\nOnCalendar=daily\nPersistent=true\n");
    expect((await onServer("grep -c '^restart nuxvel-tasks-maintenance.timer$' /run/fake-systemctl")).output).toBe("1\n");
    expect((await onServer(`grep ^ConditionPathExists= ${unit}.service`)).output).toBe(
      "ConditionPathExists=/srv/apps/tasks/current/.output/server/nuxvel/maintenance.mjs\n",
    );

    const entry = "/srv/apps/tasks/releases/1/.output/server/nuxvel/maintenance.mjs";
    const maintenance = await onServer(
      `mkdir -p $(dirname ${entry}) && ln -sfn /srv/apps/tasks/releases/1 /srv/apps/tasks/current && ` +
        `echo 'console.log(process.env.USER, process.cwd(), process.env.NUXT_DATABASE_OWNER_URL?.split(":")[1], process.env.NUXT_DATABASE_URL?.split(":")[1])' > ${entry} && ` +
        `field() { sed -n "s/^$1=//p" ${unit}.service; } && ` +
        `cd $(field WorkingDirectory) && ` +
        `runuser -u $(field User) -- env USER=$(field User) $(field EnvironmentFile | xargs cat) $(field ExecStart); ` +
        "rm -rf /srv/apps/tasks/current /srv/apps/tasks/releases/1",
    );
    expect(maintenance.output).toBe("deploy /srv/apps/tasks/releases/1 //tasks_owner //tasks_app\n");
  }, 60000);

  it("runs the web processes of a color in cluster mode and its workers in fork mode under pm2, from the color's link to a release", async () => {
    const folder = "/srv/apps/tasks";
    const release = "20260927T100000Z-abc1234";
    const server = `import { createServer } from "node:http";
createServer((req, res) => res.end(JSON.stringify({ role: process.env.NUXVEL_ROLE ?? "web", pid: process.pid, prefix: process.env.NUXT_REDIS_PREFIX, pool: process.env.NUXT_DATABASE_POOL_MAX, trustProxy: process.env.NUXT_NUXVEL_SECURITY_TRUST_PROXY, erasureLog: process.env.NUXT_ERASURE_LOG_COMMAND, cwd: process.cwd() })))
  .listen(Number(process.env.PORT), process.env.HOST, () => process.send?.("ready"));
`;
    const ecosystem = ecosystemFile({ app: "tasks", folder, color: "blue", port: 3020, processes: { web: 2, worker: 2 }, databasePoolMax: 4 });
    const write = (file: string, contents: string) =>
      `echo ${Buffer.from(contents).toString("base64")} | base64 -d > ${file}`;
    const asDeploy = (command: string) => onServer(`cd / && runuser -u deploy -- env HOME=/home/deploy ${command} 2>&1`);
    const written = await asDeploy(
      `sh -c 'mkdir -p ${folder}/releases/${release}/.output/server && ` +
        `${write(`${folder}/releases/${release}/.output/server/index.mjs`, server)} && ${write(`${folder}/ecosystem.blue.config.cjs`, ecosystem)} && ` +
        `ln -s releases/${release} ${folder}/blue'`,
    );
    expect(written.exitCode, written.output).toBe(0);
    onTestFinished(async () => {
      await asDeploy(`sh -c 'pm2 kill >/dev/null; rm -rf ${folder}/releases/${release} ${folder}/ecosystem.blue.config.cjs ${folder}/blue'`);
    });

    const started = await asDeploy(`pm2 start ${folder}/ecosystem.blue.config.cjs`);
    expect(started.exitCode, started.output).toBe(0);
    const processes: { name: string; pm2_env: Record<string, unknown> }[] = JSON.parse((await asDeploy("pm2 jlist")).output);
    expect(
      processes
        .map(({ name, pm2_env: env }) => [name, env.exec_mode, env.status, env.pm_exec_path, env.kill_timeout])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["tasks-web-blue", "cluster_mode", "online", `${folder}/blue/.output/server/index.mjs`, 10000],
      ["tasks-web-blue", "cluster_mode", "online", `${folder}/blue/.output/server/index.mjs`, 10000],
      ["tasks-worker-blue", "fork_mode", "online", `${folder}/blue/.output/server/index.mjs`, 30000],
      ["tasks-worker-blue", "fork_mode", "online", `${folder}/blue/.output/server/index.mjs`, 30000],
    ]);

    const ask = async (port: number) => JSON.parse((await onServer(`curl -s http://127.0.0.1:${port}/`)).output);
    const web = await Promise.all([1, 2, 3, 4, 5, 6].map(() => ask(3020)));
    expect(new Set(web.map((answer) => answer.pid)).size).toBe(2);
    expect(web[0]).toMatchObject({
      role: "web",
      prefix: "tasks:",
      pool: "4",
      trustProxy: "loopback",
      erasureLog: "sudo -n /usr/local/lib/nuxvel/erasure tasks",
      cwd: `${folder}/releases/${release}`,
    });
    expect(await ask(3021)).toMatchObject({ role: "worker", prefix: "tasks:", pool: "4" });
    expect(await ask(3022)).toMatchObject({ role: "worker", prefix: "tasks:" });
    expect((await onServer("ss -ltnH '( sport >= :3020 and sport <= :3029 )' | awk '{ print $4 }' | sort -u")).output).toBe(
      "127.0.0.1:3020\n127.0.0.1:3021\n127.0.0.1:3022\n",
    );
    expect((await asDeploy("pm2 jlist")).output).not.toContain("NUXT_DATABASE_URL");
  }, 120000);

  it("serves an app through Caddy from the port of a color, with its assets from shared/ and its redirects", async () => {
    const shop = appWithFakeSsh({
      app: "shop",
      domains: ["shop.example.com"],
      redirects: {
        "www.shop.example.com": "shop.example.com",
        "/old-pricing": "/pricing",
        "shop.example.com/blog": "blog.example.com/shop",
      },
      filesDomain: "files.shop.example.com",
    });
    const created = await shop.createApp("production");
    expect(created.exitCode, created.output).toBe(0);
    expect(created.output).toContain("~ set NUXT_STORAGE_PUBLIC_URL=https://files.shop.example.com in /srv/apps/shop/shared/.env");
    expect((await onServer("grep ^NUXT_STORAGE_PUBLIC_URL= /srv/apps/shop/shared/.env")).output).toBe(
      "NUXT_STORAGE_PUBLIC_URL=https://files.shop.example.com\n",
    );
    const entry = JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output).apps.shop;
    expect(entry.domains).toEqual(["shop.example.com"]);
    expect(entry.filesDomain).toBe("files.shop.example.com");
    expect(entry.redirects).toEqual({
      "www.shop.example.com": "shop.example.com",
      "/old-pricing": "/pricing",
      "shop.example.com/blog": "blog.example.com/shop",
    });
    const [blue, green] = [entry.ports.blue[0], entry.ports.green[0]];

    const upstream =
      'require("node:http").createServer((req, res) => { if (req.url === "/events") { res.writeHead(200, { "content-type": "text/event-stream" }); res.write("data: hello\\n\\n"); return; } if (req.url === "/body") { let size = 0; req.on("data", (chunk) => { size += chunk.length; }); req.on("end", () => res.end(String(size))); return; } if (req.url === "/forwarded") return res.end(String(req.headers.forwarded)); res.end(process.argv[2] + " " + req.url); }).listen(Number(process.argv[3]), "127.0.0.1")';
    const caddyfile = "{\n\thttp_port 8480\n\thttps_port 8490\n\tlocal_certs\n\tskip_install_trust\n\tadmin localhost:2020\n}\nimport /etc/caddy/sites/*.caddy";
    const started = await onServer(
      `printf '%s\\n' '${upstream}' > /tmp/upstream.js && printf '%s\\n' '${caddyfile}' > /tmp/Caddyfile.test && ` +
        `(setsid node /tmp/upstream.js blue ${blue} >/dev/null 2>&1 &) && (setsid node /tmp/upstream.js green ${green} >/dev/null 2>&1 &) && ` +
        `runuser -u deploy -- sh -c 'cd $(mktemp -d) && head -c 2000 /dev/zero | tr "\\0" x > entry.abc123.js && tar -c . | sudo -n /usr/local/lib/nuxvel/assets shop add'`,
    );
    expect(started.exitCode, started.output).toBe(0);
    onTestFinished(async () => {
      await onServer("caddy stop --address localhost:2020; pkill -f /tmp/upstream.js; rm -f /tmp/upstream.js /tmp/Caddyfile.test");
    });

    const site = (color: string) => onServer(`runuser -u deploy -- sudo -n /usr/local/lib/nuxvel/caddy-site shop ${color} 2>&1`);
    await onServer(
      "printf 'root only\\n' > /root/caddy-sentinel && chmod 600 /root/caddy-sentinel && " +
        "runuser -u caddy -- ln -s /root/caddy-sentinel /var/log/caddy/shop.access.log",
    );
    expect((await site("blue")).exitCode).not.toBe(0);
    expect((await onServer("stat -c '%U %a' /root/caddy-sentinel")).output).toBe("root 600\n");
    await onServer("rm /var/log/caddy/shop.access.log");
    const blueSite = await site("blue");
    expect(blueSite.exitCode, blueSite.output).toBe(0);
    expect(blueSite.output).toContain(`Caddy serves shop from blue on 127.0.0.1:${blue}`);
    expect(blueSite.output).not.toContain('"level"');
    expect((await onServer("stat -c '%U %a' /etc/caddy/sites/shop.caddy /var/log/caddy/shop.access.log")).output).toBe(
      "root 644\ncaddy 644\n",
    );
    expect((await onServer("tail -1 /run/fake-systemctl")).output).toBe("reload caddy\n");

    const caddy = await onServer(
      "cd /var/lib/caddy && runuser -u caddy -- env HOME=/var/lib/caddy caddy start --config /tmp/Caddyfile.test --adapter caddyfile 2>&1 && " +
        "timeout 30 sh -c 'until curl -sfk --resolve shop.example.com:8490:127.0.0.1 -o /dev/null https://shop.example.com:8490/ && " +
        "curl -sk --resolve files.shop.example.com:8490:127.0.0.1 -o /dev/null https://files.shop.example.com:8490/; do sleep 0.2; done'",
    );
    expect(caddy.exitCode, caddy.output).toBe(0);
    const request = (url: string, flags = "") =>
      onServer(
        "curl -sSk --resolve shop.example.com:8490:127.0.0.1 --resolve www.shop.example.com:8490:127.0.0.1 --resolve files.shop.example.com:8490:127.0.0.1 " +
          `${flags} 'https://${url}'`,
      );

    expect((await request("shop.example.com:8490/tasks?page=2")).output).toBe("blue /tasks?page=2");
    await request("shop.example.com:8490/api/auth/reset-password/resettoken1?callbackURL=/x", "-H 'Referer: https://shop.example.com/reset-password?token=referertoken3'");
    await request("shop.example.com:8490/api/auth/verify-email?token=verifytoken2");
    const accessLog = await onServer(
      "timeout 10 sh -c 'until grep -q verify-email /var/log/caddy/shop.access.log; do sleep 0.1; done' && cat /var/log/caddy/shop.access.log",
    );
    expect(accessLog.exitCode, accessLog.output).toBe(0);
    expect(accessLog.output).toContain('"uri":"/api/auth/reset-password/REDACTED?REDACTED"');
    expect(accessLog.output).toContain('"uri":"/api/auth/verify-email?REDACTED"');
    expect(accessLog.output).not.toMatch(/resettoken1|verifytoken2|referertoken3/);
    expect((await request("shop.example.com:8490/forwarded", "-H 'Forwarded: for=192.0.2.66'")).output).toBe("undefined");
    const asset = (await request("shop.example.com:8490/_nuxt/entry.abc123.js", "-H 'Accept-Encoding: gzip' -D - -o /dev/null")).output;
    expect(asset).toMatch(/^HTTP\/2 200/);
    expect(asset).toMatch(/^cache-control: public, max-age=31536000, immutable\r$/m);
    expect(asset).toMatch(/^content-encoding: gzip\r$/m);
    expect((await request("shop.example.com:8490/_nuxt/missing.js", "-o /dev/null -w '%{http_code}'")).output).toBe("404");
    await onServer("printf 'caddy only\\n' > /var/lib/caddy/key-sentinel && chown caddy:caddy /var/lib/caddy/key-sentinel && chmod 600 /var/lib/caddy/key-sentinel");
    const assets = "/srv/nuxvel/assets/shop";
    expect((await onServer("id -nG caddy")).output).not.toMatch(/\bdeploy\b/);
    expect((await onServer(`runuser -u deploy -- ln -s /var/lib/caddy/key-sentinel ${assets}/_nuxt/k.js`)).exitCode).not.toBe(0);
    expect((await onServer(`runuser -u deploy -- mv ${assets} /tmp/x`)).exitCode).not.toBe(0);
    const linked = await onServer(
      `runuser -u deploy -- sh -c 'cd $(mktemp -d) && ln -s /var/lib/caddy/key-sentinel link.js && tar -c . | sudo -n /usr/local/lib/nuxvel/assets shop add' 2>&1`,
    );
    expect(linked.exitCode).toBe(1);
    expect(linked.output).toContain("The assets hold a link or a special file");
    expect((await onServer(`ls ${assets}/_nuxt`)).output).toBe("entry.abc123.js\n");
    expect((await request("shop.example.com:8490/_nuxt/link.js", "-o /dev/null -w '%{http_code}'")).output).toBe("404");
    await onServer(`printf '../../../etc/passwd\\n/etc/passwd\\nentry.abc123.js\\n' | runuser -u deploy -- sudo -n /usr/local/lib/nuxvel/assets shop remove`);
    expect((await onServer("test -f /etc/passwd")).exitCode).toBe(0);
    expect((await onServer(`ls ${assets}/_nuxt`)).output).toBe("");
    expect((await request("shop.example.com:8490/events", "-N --max-time 2")).output).toMatch(/^data: hello\n\ncurl: \(28\) Operation timed out/);
    expect((await onServer("cat /etc/caddy/sites/shop.caddy")).output).toContain("\trequest_body {\n\t\tmax_size 8MB\n\t}\n");
    const bodyStatus = (flags: string) =>
      request("shop.example.com:8490/body", `-X POST -o /dev/null -w '%{http_code}' ${flags}`).then(({ output }) => output);
    await onServer("head -c 9000000 /dev/zero > /tmp/body.bin");
    expect(await bodyStatus("-H 'Transfer-Encoding: chunked' --data-binary @/tmp/body.bin")).toBe("413");
    expect(await bodyStatus("--data-binary @/tmp/body.bin")).toBe("413");
    expect(await bodyStatus("--data-binary small")).toBe("200");

    const redirect = async (url: string) => (await request(url, "-o /dev/null -w '%{http_code} %{redirect_url}'")).output;
    expect(await redirect("shop.example.com:8490/old-pricing")).toBe("301 https://shop.example.com:8490/pricing");
    expect(await redirect("shop.example.com:8490/blog")).toBe("301 https://blog.example.com/shop");
    expect(await redirect("www.shop.example.com:8490/cart?step=2")).toBe("301 https://shop.example.com/cart?step=2");

    const credentials = `"$(sed -n 's|^NUXT_STORAGE_URL=http://\\(.*\\)@.*|\\1|p' /srv/apps/shop/shared/.env)"`;
    const signed = `--aws-sigv4 aws:amz:us-east-1:s3 --user ${credentials}`;
    const stored = await onServer(
      `curl -fsS ${signed} -X PUT -H 'Content-Type: text/html' --data-binary '<p>invoice</p>' http://127.0.0.1:8333/shop-private/invoice.html && ` +
        `curl -fsS ${signed} -X PUT --data-binary logo http://127.0.0.1:8333/shop-public/logo.txt`,
    );
    expect(stored.exitCode, stored.output).toBe(0);
    const download = (await request("files.shop.example.com:8490/shop-private/invoice.html", `${signed} -D -`)).output;
    expect(download).toMatch(/^HTTP\/2 200/);
    expect(download).toMatch(/^x-content-type-options: nosniff\r$/m);
    expect(download).toMatch(/^content-security-policy: sandbox\r$/m);
    expect(download).toContain("<p>invoice</p>");
    expect((await request("files.shop.example.com:8490/shop-private/invoice.html", "-o /dev/null -w '%{http_code}'")).output).toBe("403");
    expect((await request("files.shop.example.com:8490/shop-public/logo.txt")).output).toBe("logo");
    expect((await request("files.shop.example.com:8490/tasks-public/logo.txt", "-o /dev/null -w '%{http_code}'")).output).toBe("404");

    expect((await site("green")).exitCode).toBe(0);
    await onServer("caddy reload --config /tmp/Caddyfile.test --adapter caddyfile --address localhost:2020");
    expect((await request("shop.example.com:8490/tasks")).output).toBe("green /tasks");

    await onServer("echo 'not a site {' > /etc/caddy/sites/broken.caddy");
    const refused = await site("blue");
    await onServer("rm /etc/caddy/sites/broken.caddy");
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain("Caddy refused the new site of shop, /etc/caddy/sites/shop.caddy is unchanged");
    expect(refused.output).toContain("Error: adapting config using caddyfile");
    expect((await onServer("grep -o 'reverse_proxy 127.0.0.1:[0-9]*' /etc/caddy/sites/shop.caddy")).output).toBe(
      `reverse_proxy 127.0.0.1:${green}\nreverse_proxy 127.0.0.1:8333\n`,
    );

    for (const args of ["nope blue", "shop red", "__proto__ blue"]) {
      const usage = await onServer(`runuser -u deploy -- sudo -n /usr/local/lib/nuxvel/caddy-site ${args} 2>&1`);
      expect(usage.exitCode).toBe(2);
      expect(usage.output).toContain("Usage: caddy-site <app> <blue|green>");
    }
  }, 120000);

  const journalOptions = {
    app: "journal",
    domains: ["journal.example.com"],
    arch: hostArch,
    processes: { web: 2, worker: 1 },
    deploy: { hold: 0 },
  };

  it("uploads a release on the first deploy after creating the app, checks it against the server, and honours the lock", async () => {
    const journal = appWithFakeSsh(journalOptions);
    const folder = "/srv/apps/journal";
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const artifact = await fakeArtifact(journal.dir, { node, commit: "abc1234def" });

    const created = await journal.deploy("production", `--artifact=${artifact}`);
    expect(created.exitCode, created.output).toBe(1);
    expect(created.output).toContain("First deploy of journal: creating it on the server");
    expect(created.output).toContain("~ create /srv/apps/journal");
    expect(created.output).toContain("~ set a random NUXT_AUTH_SECRET in /srv/apps/journal/shared/.env");
    expect(created.output).toContain(`✖ ${folder}/shared/.env fails the server's boot checks: NUXT_MAIL_URL: Required in production`);
    expect(created.output).toContain("→ Set the variables in .nuxvel/production.env (nuxvel env:pull production) and run nuxvel env:push production, nothing is deployed");
    expect((await journal.envPull("production")).exitCode).toBe(0);
    const local = join(journal.dir, ".nuxvel", "production.env");
    writeFileSync(local, `${readFileSync(local, "utf8")}NUXT_MAIL_URL=smtp://mail.example.com:587\n`);
    const pushed = await journal.envPush("production");
    expect(pushed.exitCode, pushed.output).toBe(0);

    const deployed = await journal.deploy("production", `--artifact=${artifact}`);
    expect(deployed.exitCode, deployed.output).toBe(0);
    const release = /Deployed the release (\d{8}T\d{6}Z-abc1234) of journal to 203\.0\.113\.10, live on blue/.exec(deployed.output)?.[1];
    expect(release, deployed.output).toBeDefined();
    expect(deployed.output).toContain(`~ extract the release ${release} into ${folder}/releases/${release}, with shared/.env`);
    expect((await onServer(`ls ${folder}/releases`)).output).toBe(`${release}\n`);
    expect((await onServer(`cd ${folder}/releases/${release} && stat -c '%U %a' . && readlink .env && test -f .output/server/index.mjs`)).output).toBe(
      "deploy 750\n../../shared/.env\n",
    );
    expect((await onServer(`stat -c '%U %a' /srv/nuxvel/assets/journal/_nuxt/entry.f00d.js`)).output).toBe("root 644\n");
    expect(deployed.output).toContain("nuxvel migrate: the database is up to date");
    expect(deployed.output).toContain("▲ production has no off-site backup target: the backups stay on 203.0.113.10, and are lost with it");
    expect(deployed.output).toContain("→ Set backups.offsite in nuxvel.deploy.ts and run nuxvel server:setup");
    expect((await onServer(`cd / && runuser -u postgres -- psql -X -tA -d journal -c "select tableowner from pg_tables where tablename = 'entries'"`)).output).toBe(
      "journal_owner\n",
    );

    const oldNode = await journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node: "18.20.0" })}`);
    expect(oldNode.exitCode).toBe(1);
    expect(oldNode.output).toContain(`cannot run on 203.0.113.10: built with Node 18.20.0, the server runs Node ${node}`);
    const otherArch = process.arch === "arm64" ? "x64" : "arm64";
    const wrongArch = await journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node, arch: otherArch })}`);
    expect(wrongArch.exitCode).toBe(1);
    expect(wrongArch.output).toContain(`is built for linux/${otherArch}, the server is linux/${process.arch}`);
    writeFileSync(`${artifact}.sha256`, `${"0".repeat(64)}  journal.tar.gz\n`);
    const tampered = await journal.deploy("production", `--artifact=${artifact}`);
    expect(tampered.exitCode).toBe(1);
    expect(tampered.output).toContain("failed verification: checksum mismatch");
    expect((await onServer(`ls ${folder}/releases`)).output).toBe(`${release}\n`);

    const lock = JSON.stringify({ id: "ci-run", user: "ci", machine: "runner-7", time: "2026-09-27T09:00:00.000Z" });
    await onServer(`runuser -u deploy -- sh -c 'echo ${JSON.stringify(lock)} > ${folder}/deploy.lock'`);
    const locked = await journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node })}`);
    expect(locked.exitCode).toBe(1);
    expect(locked.output).toContain("✖ journal is being deployed by ci on runner-7 since 2026-09-27T09:00:00.000Z");
    expect(locked.output).toContain("→ Wait for that deploy to finish. If it stopped, run nuxvel deploy:unlock production");
    expect((await onServer(`cat ${folder}/deploy.lock`)).output).toBe(`${lock}\n`);
    await onServer(`rm ${folder}/deploy.lock`);
  }, 120000);

  it("checks shared/.env against the boot checks and runs the migrations as the owner role, switching nothing when either fails", async () => {
    const journal = appWithFakeSsh(journalOptions);
    const folder = "/srv/apps/journal";
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const releases = async () => (await onServer(`ls ${folder}/releases`)).output;
    const before = await releases();

    await onServer(`sed -i '/^NUXT_AUTH_SECRET=/d' ${folder}/shared/.env`);
    const noSecret = await journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node })}`);
    expect(noSecret.exitCode).toBe(1);
    expect(noSecret.output).toContain(`✖ ${folder}/shared/.env fails the server's boot checks: NUXT_AUTH_SECRET is not set`);
    expect(noSecret.output).not.toContain("NUXT_REDIS_URL=");
    expect(await releases()).toBe(before);
    expect((await journal.createApp("production")).output).toContain("~ set a random NUXT_AUTH_SECRET");

    const failing = await journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node, failingMigration: true })}`);
    expect(failing.exitCode).toBe(1);
    expect(failing.output).toContain("nuxvel migrate: could not apply the migrations");
    expect(failing.output).toContain("the live release keeps serving, nothing is switched");
    expect(failing.output).toContain("✖ The migrations failed on deploy@203.0.113.10 (exit code 1)");
    expect(await releases()).toBe(before);
    expect((await onServer(`ls ${folder}/deploy.lock`)).exitCode).not.toBe(0);
  }, 120000);

  it("starts the idle color, checks it, swaps the workers and switches Caddy to it, leaving the live color alone when a check fails", async () => {
    const journal = appWithFakeSsh(journalOptions);
    const folder = "/srv/apps/journal";
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const state = async () => JSON.parse((await onServer(`cat ${folder}/state.json`)).output);
    const asDeploy = (command: string) => onServer(`cd / && runuser -u deploy -- env HOME=/home/deploy ${command} 2>&1`);
    const processes = async () => {
      const list: { name: string; pm2_env: { status: string } }[] = JSON.parse((await asDeploy("pm2 jlist")).output);
      return list.map(({ name, pm2_env: env }) => `${name} ${env.status}`).sort();
    };
    const live = (await state()).active;
    const idle = live === "blue" ? "green" : "blue";
    const { ports } = JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output).apps.journal;
    const port = ports[idle][0];

    const deployed = await journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node, commit: "fedcba987" })}`);
    expect(deployed.exitCode, deployed.output).toBe(0);
    const release = /Deployed the release (\S+) of journal to 203\.0\.113\.10, live on (\w+)/.exec(deployed.output);
    expect(release?.[2]).toBe(idle);
    for (const line of [
      `~ start journal-web-${idle} on 127.0.0.1:${port}`,
      "  / answers 200",
      `~ start journal-worker-${idle}`,
      `~ stop journal-worker-${live} once its jobs finish`,
      `Caddy serves journal from ${idle} on 127.0.0.1:${port}`,
      `~ switch journal to ${idle}: ${release?.[1]} is live`,
    ]) {
      expect(deployed.output).toContain(line);
    }
    expect(await state()).toMatchObject({
      active: idle,
      releases: { [idle]: release?.[1] },
      processes: { [idle]: { web: 2, worker: 1 } },
    });
    expect((await onServer(`readlink ${folder}/current; stat -c '%U %a' ${folder}/ecosystem.${idle}.config.cjs`)).output).toBe(
      `releases/${release?.[1]}\ndeploy 600\n`,
    );
    expect(await processes()).toEqual(
      expect.arrayContaining([
        `journal-web-${idle} online`,
        `journal-web-${idle} online`,
        `journal-worker-${idle} online`,
      ]),
    );
    expect((await processes()).filter((line) => line.startsWith(`journal-web-${live} `) || line.startsWith(`journal-worker-${live} `))).toEqual([]);
    expect(JSON.parse((await onServer(`curl -s http://127.0.0.1:${port}/`)).output)).toEqual({ release: release?.[1], role: "web", pool: "10" });
    expect(JSON.parse((await onServer(`curl -s http://127.0.0.1:${port + 1}/`)).output)).toMatchObject({ role: "worker" });
    expect((await onServer("grep -o 'reverse_proxy 127.0.0.1:[0-9]*' /etc/caddy/sites/journal.caddy")).output).toBe(
      `reverse_proxy 127.0.0.1:${port}\n`.repeat(1),
    );

    const broken = await journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node, status: 500 })}`);
    expect(broken.exitCode).toBe(1);
    expect(broken.output).toContain(`/ answers 500 on journal-web-${live}`);
    expect(broken.output).toContain("The live color keeps serving, nothing is switched");
    expect(await state()).toMatchObject({ active: idle, releases: { [idle]: release?.[1] } });
    expect((await onServer(`readlink ${folder}/current`)).output).toBe(`releases/${release?.[1]}\n`);
    const after = await processes();
    expect(after.filter((line) => line.startsWith(`journal-web-${live} `))).toEqual([]);
    expect(after).toContain(`journal-worker-${idle} online`);
    expect((await onServer("grep -o 'reverse_proxy 127.0.0.1:[0-9]*' /etc/caddy/sites/journal.caddy")).output).toBe(
      `reverse_proxy 127.0.0.1:${port}\n`,
    );
  }, 180000);

  it("holds the old color while it watches the new one, switches back on 5xx answers with an alert, and retires the old color after a clean hold", async () => {
    const folder = "/srv/apps/journal";
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const state = async () => JSON.parse((await onServer(`cat ${folder}/state.json`)).output);
    const asDeploy = (command: string) => onServer(`cd / && runuser -u deploy -- env HOME=/home/deploy ${command} 2>&1`);
    const processes = async () => {
      const list: { name: string; pm2_env: { status: string } }[] = JSON.parse((await asDeploy("pm2 jlist")).output);
      return list.map(({ name, pm2_env: env }) => `${name} ${env.status}`).sort();
    };
    const hook = `require("node:http").createServer((req, res) => { let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => { require("node:fs").appendFileSync("/tmp/alerts.log", body + "\\n"); res.end(); }); }).listen(4999, "127.0.0.1");`;
    await onServer(`echo ${Buffer.from(hook).toString("base64")} | base64 -d > /tmp/hook.js && (nohup node /tmp/hook.js > /dev/null 2>&1 &)`);
    onTestFinished(async () => {
      await onServer("pkill -f /tmp/hook.js; rm -f /tmp/hook.js /tmp/alerts.log");
    });
    const before = await state();
    const live = before.active;
    const idle = live === "blue" ? "green" : "blue";
    const { ports } = JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output).apps.journal;

    const watched = appWithFakeSsh({ ...journalOptions, deploy: { hold: 60 }, alerts: { webhook: "http://127.0.0.1:4999/alerts" } });
    const deploying = watched.deploy("production", `--artifact=${await fakeArtifact(watched.dir, { node, commit: "0badc0de" })}`);
    await expect.poll(async () => (await onServer(`cat ${folder}/hold.log`)).output, { timeout: 60000, interval: 500 }).toContain("Holding ");
    expect(await processes()).toContain(`journal-web-${live} online`);
    await expect.poll(async () => (await onServer("cat /tmp/drained.log")).output, { timeout: 10000 }).toBe(
      `${before.releases[live]}\n`.repeat(2),
    );
    const errors = Array.from({ length: 20 }, () => '{"status":502}').join("\\n");
    await onServer(`printf '${errors}\\n' >> /var/log/caddy/journal.access.log`);

    const switchedBack = await deploying;
    expect(switchedBack.exitCode).toBe(1);
    expect(switchedBack.output).toContain(`Holding ${live} for 60s while ${idle} serves`);
    expect(switchedBack.output).toContain(`~ close the realtime streams of journal-web-${live}, so its clients reconnect to ${idle}`);
    expect(switchedBack.output).toContain(`▲ 20 of the last 20 requests answered 5xx on ${idle}: switching back to ${live}`);
    expect(switchedBack.output).toContain(`failed after the switch, journal is back on ${live} with ${before.releases[live]}`);
    expect(await state()).toMatchObject({ active: live, releases: { [live]: before.releases[live], [idle]: null } });
    expect((await onServer(`readlink ${folder}/current; ls ${folder}/deploy.lock`)).output).toContain(`releases/${before.releases[live]}\n`);
    expect((await onServer(`ls ${folder}/deploy.lock`)).exitCode).not.toBe(0);
    expect((await onServer("grep -o 'reverse_proxy 127.0.0.1:[0-9]*' /etc/caddy/sites/journal.caddy")).output).toBe(
      `reverse_proxy 127.0.0.1:${ports[live][0]}\n`,
    );
    const afterSwitchBack = await processes();
    expect(afterSwitchBack.filter((line) => line.includes(`-${idle} `))).toEqual([]);
    expect(afterSwitchBack).toContain(`journal-worker-${live} online`);
    const alerts = (await onServer("cat /tmp/alerts.log")).output;
    expect(alerts).toContain('"event":"deploy.switched-back"');
    expect(alerts).toContain("nuxvel queue:retry");

    const assets = "/srv/nuxvel/assets/journal/_nuxt";
    await onServer(`touch -d "10 days ago" ${assets}/old.1234.js && touch ${assets}/recent.5678.js`);
    await onServer(`node -e 'const f = "${folder}/state.json"; const fs = require("fs"); const s = JSON.parse(fs.readFileSync(f)); delete s.passed; fs.writeFileSync(f, JSON.stringify(s))'`);
    const held = appWithFakeSsh({ ...journalOptions, deploy: { hold: 3 } });
    const clean = await held.deploy("production", `--artifact=${await fakeArtifact(held.dir, { node, commit: "c1ea4b0" })}`);
    expect(clean.exitCode, clean.output).toBe(0);
    expect(clean.output).toContain(`Holding ${live} for 3s while ${idle} serves`);
    expect(clean.output).toContain(`~ retire the ${live} processes of journal`);
    expect(clean.output).toContain("~ remove 1 assets older than 7 days that no kept release uses");
    const kept = /Kept (\d+) of \d+ releases/.exec(clean.output)?.[1];
    expect(Number(kept)).toBeLessThanOrEqual(5);
    expect((await onServer(`ls ${folder}/releases | wc -l; ls ${assets}`)).output).toBe(`${kept}\nentry.f00d.js\nrecent.5678.js\n`);
    expect((await onServer(`ls ${folder}/releases`)).output).not.toContain("-0badc0");
    const afterRetire = await processes();
    expect(afterRetire.filter((line) => line.includes(`-${live} `))).toEqual([]);
    expect(afterRetire).toContain(`journal-worker-${idle} online`);
    expect((await state()).processes).toEqual({ [idle]: { web: 2, worker: 1 } });
    expect((await onServer(`ls ${folder}/deploy.lock`)).exitCode).not.toBe(0);
  }, 240000);

  it("replaces the processes of the live color one at a time with the rolling strategy, and rolls a failing release back", async () => {
    const folder = "/srv/apps/journal";
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const state = async () => JSON.parse((await onServer(`cat ${folder}/state.json`)).output);
    const asDeploy = (command: string) => onServer(`cd / && runuser -u deploy -- env HOME=/home/deploy ${command} 2>&1`);
    const before = await state();
    const live = before.active;
    const { ports } = JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output).apps.journal;
    const port = ports[live][0];
    const ask = async () => JSON.parse((await onServer(`curl -s http://127.0.0.1:${port}/`)).output).release;
    const rolling = appWithFakeSsh({ ...journalOptions, deploy: { hold: 0, strategy: "rolling" } });

    await onServer(
      `nohup sh -c 'while true; do curl -s -o /dev/null -w "%{http_code}\\n" --max-time 2 http://127.0.0.1:${port}/ >> /tmp/rolling.log; done' > /dev/null 2>&1 & echo $! > /tmp/rolling.pid`,
    );
    onTestFinished(async () => {
      await onServer("kill $(cat /tmp/rolling.pid) 2>/dev/null; rm -f /tmp/rolling.log /tmp/rolling.pid");
    });
    const rolled = await rolling.deploy("production", `--artifact=${await fakeArtifact(rolling.dir, { node, commit: "4011ed" })}`);
    await onServer("kill $(cat /tmp/rolling.pid)");
    expect(rolled.exitCode, rolled.output).toBe(0);
    const release = /Deployed the release (\S+) of journal to 203\.0\.113\.10, live on (\w+)/.exec(rolled.output);
    expect(release?.[2]).toBe(live);
    expect(rolled.output).toContain(`~ replace journal-worker-${live}`);
    expect(rolled.output).toContain(`~ replace the processes of journal-web-${live} one at a time on 127.0.0.1:${port}`);
    expect(rolled.output).toContain(`~ roll journal on ${live}: ${release?.[1]} is live`);
    expect(await state()).toMatchObject({ active: live, releases: { [live]: release?.[1] } });
    expect((await onServer(`readlink ${folder}/${live} ${folder}/current`)).output).toBe(`releases/${release?.[1]}\n`.repeat(2));
    expect(await ask()).toBe(release?.[1]);
    const statuses = (await onServer("sort -u /tmp/rolling.log")).output;
    expect(statuses).toBe("200\n");
    const list: { name: string }[] = JSON.parse((await asDeploy("pm2 jlist")).output);
    expect(list.filter(({ name }) => name.startsWith("journal-")).every(({ name }) => name.endsWith(`-${live}`))).toBe(true);

    const broken = await rolling.deploy("production", `--artifact=${await fakeArtifact(rolling.dir, { node, status: 500 })}`);
    expect(broken.exitCode).toBe(1);
    expect(broken.output).toContain(`/ answers 500 on journal-web-${live}`);
    expect(broken.output).toContain(`Rolled journal back to ${release?.[1]}, nothing is switched`);
    expect(await ask()).toBe(release?.[1]);
    expect((await onServer(`readlink ${folder}/${live} ${folder}/current`)).output).toBe(`releases/${release?.[1]}\n`.repeat(2));
    expect(await state()).toMatchObject({ active: live, releases: { [live]: release?.[1] } });

    const watched = appWithFakeSsh({ ...journalOptions, deploy: { hold: 60, strategy: "rolling" } });
    const deploying = watched.deploy("production", `--artifact=${await fakeArtifact(watched.dir, { node, commit: "5ca1ab1e" })}`);
    await expect.poll(async () => (await onServer(`cat ${folder}/hold.log`)).output, { timeout: 60000, interval: 500 }).toContain("Watching ");
    const errors = Array.from({ length: 20 }, () => '{"status":500}').join("\\n");
    await onServer(`printf '${errors}\\n' >> /var/log/caddy/journal.access.log`);
    const rolledBack = await deploying;
    expect(rolledBack.exitCode).toBe(1);
    expect(rolledBack.output).toContain(`Watching `);
    expect(rolledBack.output).toContain(`▲ 20 of the last 20 requests answered 5xx on ${live}: switching back to ${release?.[1]}`);
    expect(rolledBack.output).toContain(`failed after the switch, journal is back on ${release?.[1]}`);
    expect(await ask()).toBe(release?.[1]);
    expect((await onServer(`readlink ${folder}/${live} ${folder}/current`)).output).toBe(`releases/${release?.[1]}\n`.repeat(2));
    expect(await state()).toMatchObject({ active: live, releases: { [live]: release?.[1] } });
  }, 240000);

  it("rolls back to the held color during the hold, and afterwards to the previous or a named release without migrations", async () => {
    const folder = "/srv/apps/journal";
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const state = async () => JSON.parse((await onServer(`cat ${folder}/state.json`)).output);
    const redis = (command: string) => onServer(`. ${folder}/shared/.env && redis-cli --no-auth-warning -u "$NUXT_REDIS_URL" ${command}`);
    await redis("zadd journal:bull:mail:failed 1 job-1");
    onTestFinished(async () => {
      await redis("del journal:bull:mail:failed");
    });
    const base = appWithFakeSsh(journalOptions);
    const listReleases = async () => (await onServer(`ls ${folder}/releases`)).output.trim().split("\n");
    expect((await base.deploy("production", `--artifact=${await fakeArtifact(base.dir, { node, commit: "600dba5e" })}`)).exitCode).toBe(0);
    const good = (await state()).releases[(await state()).active];
    expect((await base.deploy("production", `--artifact=${await fakeArtifact(base.dir, { node, status: 500 })}`)).exitCode).toBe(1);
    const failed = (await listReleases()).at(-1);
    expect(failed).not.toBe(good);
    expect((await base.deploy("production", `--artifact=${await fakeArtifact(base.dir, { node, commit: "ba5eba11" })}`)).exitCode).toBe(0);
    expect(await listReleases()).not.toContain(failed);
    const before = await state();
    const live = before.active;
    const idle = live === "blue" ? "green" : "blue";
    const liveRelease = before.releases[live];

    const held = appWithFakeSsh({ ...journalOptions, deploy: { hold: 60 } });
    const deploying = held.deploy("production", `--artifact=${await fakeArtifact(held.dir, { node, commit: "7e57ab1e" })}`);
    await expect.poll(async () => (await onServer(`cat ${folder}/hold.log`)).output, { timeout: 60000, interval: 500 }).toContain("Holding ");
    const inHold = await held.rollback("production");
    expect(inHold.exitCode, inHold.output).toBe(0);
    expect(inHold.output).toContain(`▲ a rollback was requested on ${idle}: switching back to ${live}`);
    expect(inHold.output).toContain("▲ 1 job is in the failed lists of journal.");
    expect(inHold.output).toContain("→ Run nuxvel queue:retry after the next deploy");
    expect(inHold.output).toContain("✔ Rolled journal back to the held release on 203.0.113.10");
    expect((await deploying).exitCode).toBe(1);
    expect(await state()).toMatchObject({ active: live, releases: { [live]: liveRelease } });

    const previous = good;
    const endingHold = `require("node:fs").writeFileSync("/tmp/ending-hold.ready", ""); process.on("SIGUSR2", () => { require("node:fs").appendFileSync("${folder}/hold.log", "@outcome retired\\n"); process.exit(0); }); setInterval(() => {}, 1000);`;
    await onServer(`mkdir -p /tmp/ending && echo ${Buffer.from(endingHold).toString("base64")} | base64 -d > /tmp/ending/hold.cjs`);
    await onServer(`runuser -u deploy -- sh -c 'nohup node /tmp/ending/hold.cjs > /dev/null 2>&1 & echo $! > ${folder}/hold.pid'`);
    onTestFinished(async () => {
      await onServer("pkill -f /tmp/ending/hold.cjs; rm -rf /tmp/ending /tmp/ending-hold.ready");
    });
    await expect.poll(async () => (await onServer("ls /tmp/ending-hold.ready")).exitCode, { timeout: 10000 }).toBe(0);
    const after = appWithFakeSsh(journalOptions);
    const rolledBack = await after.rollback("production");
    expect(rolledBack.exitCode, rolledBack.output).toBe(0);
    expect(rolledBack.output).toContain(`Rolling journal back from ${liveRelease} to ${previous}, without migrations`);
    expect(rolledBack.output).not.toContain("nuxvel migrate");
    expect(rolledBack.output).toContain(`Deployed the release ${previous} of journal to 203.0.113.10, live on ${idle}`);
    expect(await state()).toMatchObject({ active: idle, releases: { [idle]: previous } });
    expect((await onServer(`readlink ${folder}/current`)).output).toBe(`releases/${previous}\n`);

    const named = await after.rollback("production", liveRelease);
    expect(named.exitCode, named.output).toBe(0);
    expect(await state()).toMatchObject({ active: live, releases: { [live]: liveRelease } });

    const unknown = await after.rollback("production", "20200101T000000Z-nope");
    expect(unknown.exitCode).toBe(1);
    expect(unknown.output).toContain("✖ journal has no release 20200101T000000Z-nope on 203.0.113.10");
    expect(unknown.output).toContain(`→ Pick one of: ${(await onServer(`ls ${folder}/releases`)).output.trim().split("\n").join(", ")}`);
    expect((await onServer(`ls ${folder}/deploy.lock`)).exitCode).not.toBe(0);
  }, 240000);

  it("applies only the contract migrations the live release contains, records them in state.json, and refuses a rollback across them", async () => {
    const folder = "/srv/apps/journal";
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const state = async () => JSON.parse((await onServer(`cat ${folder}/state.json`)).output);
    const journal = appWithFakeSsh(journalOptions);
    const deployWith = async (commit: string, contract: string[]) =>
      journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node, commit, contract })}`);
    onTestFinished(async () => {
      await onServer(
        `node -e 'const f = "${folder}/state.json"; const fs = require("fs"); const s = JSON.parse(fs.readFileSync(f)); s.contractMigrations = []; fs.writeFileSync(f, JSON.stringify(s))'`,
      );
    });

    expect((await deployWith("c0ffee01", [])).exitCode).toBe(0);
    const oldRelease = (await state()).releases[(await state()).active];

    const introduced = await deployWith("c0ffee02", ["0100_entries-drop-old"]);
    expect(introduced.exitCode, introduced.output).toBe(0);
    expect(introduced.output).toContain("▲ Deferred the contract migration 0100_entries-drop-old: it runs once no older release runs");
    expect((await state()).contractMigrations).not.toContain("0100_entries-drop-old");

    const contracted = await deployWith("c0ffee03", ["0100_entries-drop-old"]);
    expect(contracted.exitCode, contracted.output).toBe(0);
    expect(contracted.output).toContain("~ apply the contract migration 0100_entries-drop-old, which the live release already contains");
    expect((await state()).contractMigrations).toContain("0100_entries-drop-old");

    const refused = await journal.rollback("production", oldRelease);
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain(`✖ ${oldRelease} is older than the applied contract migrations 0100_entries-drop-old`);
    expect(refused.output).toContain("→ It may read what they removed. Roll back to a newer release, or run it anyway with --force");

    const previous = await journal.rollback("production");
    expect(previous.exitCode, previous.output).toBe(0);

    const forced = await journal.rollback("production", oldRelease, "--force");
    expect(forced.exitCode, forced.output).toBe(0);
    expect(await state()).toMatchObject({ releases: { [(await state()).active]: oldRelease } });
  }, 240000);

  it("db:contract applies the deferred contract migrations of the live release once no older color runs", async () => {
    const folder = "/srv/apps/journal";
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const state = async () => JSON.parse((await onServer(`cat ${folder}/state.json`)).output);
    const asDeploy = (command: string) => onServer(`cd / && runuser -u deploy -- env HOME=/home/deploy ${command} 2>&1`);
    const journal = appWithFakeSsh(journalOptions);
    const deployWith = async (commit: string, contract: string[]) =>
      journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node, commit, contract })}`);
    onTestFinished(async () => {
      await onServer(
        `node -e 'const f = "${folder}/state.json"; const fs = require("fs"); const s = JSON.parse(fs.readFileSync(f)); s.contractMigrations = []; fs.writeFileSync(f, JSON.stringify(s))'`,
      );
    });

    expect((await deployWith("c0ffee04", [])).exitCode).toBe(0);
    const deployed = await deployWith("c0ffee05", ["0101_entries-drop-older"]);
    expect(deployed.exitCode, deployed.output).toBe(0);
    expect(deployed.output).toContain("▲ Contract migrations are deferred");
    expect(deployed.output).toContain("→ Run nuxvel db:contract production to apply them, now that no older release runs");

    const { active, releases } = await state();
    const idle = active === "blue" ? "green" : "blue";
    expect((await asDeploy(`pm2 start sleep --name journal-web-${idle} -- 600`)).exitCode).toBe(0);
    const refused = await journal.contract("production");
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain(`✖ The ${idle} color of journal still runs ${releases[idle]}, which may read what the contract migrations remove`);
    expect((await state()).contractMigrations).not.toContain("0101_entries-drop-older");
    expect((await asDeploy(`pm2 delete journal-web-${idle}`)).exitCode).toBe(0);

    const applied = await journal.contract("production");
    expect(applied.exitCode, applied.output).toBe(0);
    expect(applied.output).toContain("~ apply the contract migration 0101_entries-drop-older");
    expect(applied.output).toContain("✔ Applied 1 contract migration of journal on 203.0.113.10");
    expect((await state()).contractMigrations).toContain("0101_entries-drop-older");
    expect((await onServer(`ls ${folder}/deploy.lock`)).exitCode).not.toBe(0);

    const again = await journal.contract("production");
    expect(again.exitCode, again.output).toBe(0);
    expect(again.output).toContain("✔ journal has no deferred contract migration on 203.0.113.10");

    const withBackfill = ["0101_entries-drop-older", "0102_entries-backfill"];
    expect((await deployWith("c0ffee06", withBackfill)).exitCode).toBe(0);
    const waiting = await journal.contract("production");
    expect(waiting.exitCode, waiting.output).toBe(0);
    expect(waiting.output).toContain("▲ The contract migration 0102_entries-backfill waits on a backfill");
    expect(waiting.output).toContain("▲ 1 contract migration of journal on 203.0.113.10 waits on a backfill");
    expect(waiting.output).toContain("→ Run nuxvel db:contract production again once the backfill completed");
    expect(waiting.output).not.toContain("no deferred contract migration");

    const redeployed = await deployWith("c0ffee07", withBackfill);
    expect(redeployed.exitCode, redeployed.output).toBe(0);
    expect(redeployed.output).toContain("▲ The contract migration 0102_entries-backfill waits on a backfill: it runs once the backfill completed");
    expect(redeployed.output).toContain("▲ Contract migrations wait on a backfill");
    expect(redeployed.output).not.toContain("Contract migrations are deferred");
  }, 240000);

  it("tinker <env> asks, then opens the REPL of the live release on the server with its environment", async () => {
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const journal = appWithFakeSsh(journalOptions);
    const deployed = await journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node, commit: "7171e4" })}`);
    expect(deployed.exitCode, deployed.output).toBe(0);
    const release = /Deployed the release (\S+) of journal/.exec(deployed.output)?.[1];

    const refused = await journal.tinker("production");
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain("✖ tinker production runs code against the live data of journal and needs a confirmation");
    expect(refused.output).toContain("→ Pass --force to run it without asking");

    const cancelled = await runCliInTtyWithEnv(journal.dir, journal.env, [["changes its live data", "n"]], "tinker", "production");
    expect(cancelled.exitCode).toBe(1);
    expect(stripAnsi(cancelled.output)).toContain("Cancelled: no REPL was opened");

    const opened = await runCliWithInput(journal.dir, "await useDb().select().from(entries)\n", journal.env, "tinker", "production", "--force");
    expect(opened.exitCode, opened.stdout + opened.stderr).toBe(0);
    expect(opened.stdout).toContain(
      `tinker in /srv/apps/journal/releases/${release} (production) read "await useDb().select().from(entries)", database set, owner set, erasure log sudo -n /usr/local/lib/nuxvel/erasure journal, trust proxy loopback`,
    );
  }, 240000);

  it("down <env>, up <env> and maintenance:status <env> ask, then run in the live release on the server", async () => {
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const journal = appWithFakeSsh(journalOptions);
    const deployed = await journal.deploy("production", `--artifact=${await fakeArtifact(journal.dir, { node, commit: "7272e4" })}`);
    expect(deployed.exitCode, deployed.output).toBe(0);
    const release = /Deployed the release (\S+) of journal/.exec(deployed.output)?.[1];
    const current = `/srv/apps/journal/releases/${release} (production)`;
    await onServer("rm -f /tmp/fake-maintenance.json");

    const refused = await journal.down("production");
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain("✖ down production takes journal offline and needs a confirmation");
    expect(refused.output).toContain("→ Pass --force to run it without asking");

    const cancelled = await runCliInTtyWithEnv(journal.dir, journal.env, [["maintenance mode?", "n"]], "down", "production");
    expect(cancelled.exitCode).toBe(1);
    expect(stripAnsi(cancelled.output)).toContain("Cancelled: the app stays up");

    const invalid = await journal.down("production", "--retry", "soon", "--force");
    expect(invalid.exitCode).toBe(2);
    expect(invalid.output).toContain("✖ --retry must be a whole number of seconds of at least 1");

    const down = await journal.down("production", "--message", "Back at noon, it's quick", "--force");
    expect(down.exitCode, down.output).toBe(0);
    expect(down.output).toContain(
      `command down in ${current} with {"kind":"down","message":"Back at noon, it's quick","allow":[],"keepQueue":false}`,
    );

    const status = await journal.maintenanceStatus("production", "--json");
    expect(status.exitCode, status.output).toBe(0);
    expect(status.output).toContain(`command maintenance:status in ${current}`);
    expect(status.output).toContain('"down": true');
    expect(status.output).toContain('"message": "Back at noon"');

    const upRefused = await journal.up("production");
    expect(upRefused.exitCode).toBe(1);
    expect(upRefused.output).toContain("✖ up production takes journal out of maintenance mode and needs a confirmation");

    const up = await journal.up("production", "--force");
    expect(up.exitCode, up.output).toBe(0);
    expect(up.output).toContain(`command up in ${current} with {"kind":"up"}`);

    const after = await journal.maintenanceStatus("production");
    expect(after.exitCode, after.output).toBe(0);
    expect(after.output).toMatch(/STATE\s+QUEUE\n\s*up\s+running/);
  }, 240000);

  it("lists the releases with their commit, source and deploy time, and removes a stale lock but not the lock of a running hold", async () => {
    const folder = "/srv/apps/journal";
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const journal = appWithFakeSsh(journalOptions);
    const state = JSON.parse((await onServer(`cat ${folder}/state.json`)).output);
    const liveRelease = state.releases[state.active];

    const json = await journal.releases("production", "--json");
    expect(json.exitCode, json.output).toBe(0);
    const { releases } = JSON.parse(json.output.slice(json.output.indexOf("{"), json.output.lastIndexOf("}") + 1));
    expect(releases.map(({ name }: { name: string }) => name)).toEqual(
      (await onServer(`ls -r ${folder}/releases`)).output.trim().split("\n"),
    );
    expect(releases.find(({ live }: { live: boolean }) => live)).toMatchObject({
      name: liveRelease,
      source: "ci",
      colors: [state.active],
      deployedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/),
    });
    const table = await journal.releases("production");
    expect(table.output).toMatch(/RELEASE\s+COMMIT\s+SOURCE\s+DEPLOYED\s+COLOR/);
    expect(table.output).toMatch(new RegExp(`${liveRelease}\\s+\\S+\\s+ci\\s+.+UTC\\s+${state.active} \\(live\\)`));
    const bothColors = { ...state, releases: Object.fromEntries(Object.keys(state.releases).map((color) => [color, liveRelease])) };
    const writeState = (value: unknown) =>
      onServer(`echo ${Buffer.from(JSON.stringify(value)).toString("base64")} | base64 -d | runuser -u deploy -- sh -c 'cat > ${folder}/state.json'`);
    await writeState(bothColors);
    const bothTable = await journal.releases("production");
    await writeState(state);
    const colors = Object.keys(state.releases).map((color) => (color === state.active ? `${color} (live)` : color)).join(", ");
    expect(bothTable.output).toMatch(new RegExp(`UTC\\s+${colors.replaceAll("(", "\\(").replaceAll(")", "\\)")}\\s*\\n`));

    expect((await journal.unlock("production")).output).toContain("✔ journal has no deploy lock on 203.0.113.10");
    const time = new Date(Date.now() - 3 * 3600000).toISOString();
    const lock = JSON.stringify({ id: "gone", user: "ci", machine: "runner-7", time });
    await onServer(`runuser -u deploy -- sh -c 'echo ${JSON.stringify(lock)} > ${folder}/deploy.lock'`);
    const unasked = await journal.unlock("production");
    expect(unasked.exitCode).toBe(1);
    expect(unasked.output).toContain("✖ deploy:unlock production removes the lock of a deploy that can still run, and needs a confirmation");
    expect(unasked.output).toContain("→ Pass --force to run it without asking");
    expect(unasked.output).toContain(`▲ The deploy lock of journal is held by ci on runner-7 since ${time}, 3 hours ago`);
    expect(unasked.output).toContain("→ If that deploy still runs, two deploys can then run their migrations at the same time");
    const cancelled = await runCliInTtyWithEnv(journal.dir, journal.env, [["Remove the deploy lock of journal?", "n"]], "deploy:unlock", "production");
    expect(cancelled.exitCode).toBe(1);
    expect(stripAnsi(cancelled.output)).toContain("Cancelled: the deploy lock stays");
    expect((await onServer(`ls ${folder}/deploy.lock`)).exitCode).toBe(0);
    const removed = await journal.unlock("production", "--force");
    expect(removed.exitCode).toBe(0);
    expect(removed.output).toContain(`✔ Removed the deploy lock of journal, held by ci on runner-7 since ${time}`);
    expect((await onServer(`ls ${folder}/deploy.lock`)).exitCode).not.toBe(0);

    const held = appWithFakeSsh({ ...journalOptions, deploy: { hold: 60 } });
    const deploying = held.deploy("production", `--artifact=${await fakeArtifact(held.dir, { node, commit: "10cced" })}`);
    await expect.poll(async () => (await onServer(`cat ${folder}/hold.log`)).output, { timeout: 60000, interval: 500 }).toContain("Holding ");
    const refused = await held.unlock("production");
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain("is still in its hold, the lock is not stale");
    expect(refused.output).toContain("→ Wait for the hold to end, or end it now with nuxvel rollback production");
    expect((await onServer(`ls ${folder}/deploy.lock`)).exitCode).toBe(0);
    const named = await held.rollback("production", liveRelease);
    expect(named.exitCode).toBe(1);
    expect(named.output).toContain("and that deploy is in its hold");
    expect(named.output).toContain("→ Wait for the hold to end, or end it now with nuxvel rollback production");
    expect((await held.rollback("production")).exitCode).toBe(0);
    expect((await deploying).exitCode).toBe(1);
  }, 180000);

  it("pulls shared/.env to .nuxvel/<env>.env and pushes it back after the boot checks, refusing during a deploy", async () => {
    const folder = "/srv/apps/journal";
    const journal = appWithFakeSsh(journalOptions);
    const local = join(journal.dir, ".nuxvel", "production.env");
    const remote = async () => (await onServer(`cat ${folder}/shared/.env`)).output;
    const original = await remote();

    const missing = await journal.envPush("production");
    expect(missing.exitCode).toBe(1);
    expect(missing.output).toContain("✖ .nuxvel/production.env is missing");
    expect(missing.output).toContain("→ Copy the server's file first with nuxvel env:pull production");

    mkdirSync(join(journal.dir, ".nuxvel"), { recursive: true });
    writeFileSync(local, "STALE=1\n", { mode: 0o644 });
    const pulled = await journal.envPull("production");
    expect(pulled.exitCode, pulled.output).toBe(0);
    expect(pulled.output).toContain("✔ Wrote shared/.env of journal on 203.0.113.10 to .nuxvel/production.env");
    expect(readFileSync(local, "utf8")).toBe(original);
    expect(statSync(local).mode & 0o777).toBe(0o600);

    expect((await journal.envPush("production")).output).toContain("already matches .nuxvel/production.env, nothing to change");

    writeFileSync(local, `${original}NUXVEL_TEST_GREETING=hello\n`);
    await onServer(`runuser -u deploy -- sh -c 'echo ROTATED=1 >> ${folder}/shared/.env'`);
    const stale = await journal.envPush("production");
    expect(stale.exitCode).toBe(1);
    expect(stale.output).toContain("✖ shared/.env of journal on 203.0.113.10 changed after the last nuxvel env:pull production");
    expect(stale.output).toContain("→ Pull it again with nuxvel env:pull production and make your changes again, nothing is uploaded");
    expect(await remote()).toBe(`${original}ROTATED=1\n`);
    await onServer(`runuser -u deploy -- sed -i '/^ROTATED=/d' ${folder}/shared/.env`);

    writeFileSync(local, original.replace(/^NUXT_AUTH_SECRET=.*\n/m, ""));
    const failing = await journal.envPush("production");
    expect(failing.exitCode).toBe(1);
    expect(failing.output).toContain("✖ .nuxvel/production.env fails the server's boot checks: NUXT_AUTH_SECRET is not set");
    expect(await remote()).toBe(original);

    writeFileSync(local, `${original}NUXVEL_TEST_GREETING="hello"\n`);
    const quoted = await journal.envPush("production");
    expect(quoted.exitCode).toBe(1);
    expect(quoted.output).toContain("✖ .nuxvel/production.env puts quotes around the value of NUXVEL_TEST_GREETING");
    expect(quoted.output).toContain("→ Write each line as KEY=value with no quotes (the server scripts read the value as it is), nothing is uploaded");

    writeFileSync(local, `${original.replace(/^NUXT_REDIS_PREFIX=.*\n/m, "NUXT_REDIS_PREFIX=journal:\n")}NUXVEL_TEST_GREETING=hello\n`);
    const lock = JSON.stringify({ id: "ci-run", user: "ci", machine: "runner-7", time: "2026-09-27T09:00:00.000Z" });
    await onServer(`runuser -u deploy -- sh -c 'echo ${JSON.stringify(lock)} > ${folder}/deploy.lock'`);
    const locked = await journal.envPush("production");
    await onServer(`rm ${folder}/deploy.lock`);
    expect(locked.exitCode).toBe(1);
    expect(locked.output).toContain("✖ journal is being deployed by ci on runner-7 since 2026-09-27T09:00:00.000Z");
    expect(await remote()).toBe(original);

    const pushed = await journal.envPush("production");
    expect(pushed.exitCode, pushed.output).toBe(0);
    expect(pushed.output).toContain("~ set NUXVEL_TEST_GREETING");
    expect(pushed.output).not.toContain("~ set NUXT_REDIS_PREFIX");
    expect(pushed.output).toContain("✔ Uploaded .nuxvel/production.env as shared/.env of journal on 203.0.113.10");
    expect(pushed.output).toContain(
      "→ Each process reads it when it starts: nuxvel deploy production starts all of them with it, and a process that pm2 restarts before then (after a crash or a reboot) also gets it",
    );
    expect(await remote()).toBe(`${original}NUXVEL_TEST_GREETING=hello\n`);
    expect((await onServer(`stat -c '%U %a' ${folder}/shared/.env`)).output).toBe("deploy 600\n");

    writeFileSync(local, original);
    const reverted = await journal.envPush("production");
    expect(reverted.output).toContain("~ remove NUXVEL_TEST_GREETING");
    expect(await remote()).toBe(original);
  }, 120000);

  async function streamCliUntil(dir: string, env: NodeJS.ProcessEnv, text: string, ...args: string[]) {
    const cli = startCli(dir, args, { env, group: true });
    const exited = () => cli.child.exitCode !== null || cli.child.signalCode !== null;

    await waitFor(async () => (stripAnsi(cli.output()).includes(text) || exited() ? true : undefined));
    await cli.stop();
    return stripAnsi(cli.output());
  }

  it("shows the status of the app, streams the logs of its live processes and Caddy, and opens a shell in its folder", async () => {
    const folder = "/srv/apps/journal";
    const journal = appWithFakeSsh(journalOptions);
    const state = JSON.parse((await onServer(`cat ${folder}/state.json`)).output);
    const release = state.releases[state.active];

    const json = await journal.status("production", "--json");
    expect(json.exitCode, json.output).toBe(0);
    const status = JSON.parse(json.output.slice(json.output.indexOf("{"), json.output.lastIndexOf("}") + 1));
    expect(status).toMatchObject({ color: state.active, release, health: { ready: true, status: 200 }, backup: null });
    expect(status.processes.map(({ name, status }: { name: string; status: string }) => `${name} ${status}`).sort()).toEqual([
      `journal-web-${state.active} online`,
      `journal-web-${state.active} online`,
      `journal-worker-${state.active} online`,
    ]);
    const table = await journal.status("production");
    expect(table.output).toContain("journal on 203.0.113.10");
    expect(table.output).toContain(`Release  ${release} (${state.active})`);
    expect(table.output).toContain("Health   ready (200)");
    expect(table.output).toContain("Backup   none yet");
    expect(table.output).toMatch(new RegExp(`journal-web-${state.active}\\s+\\d+\\s+online\\s+\\d+ MB\\s+\\d+\\s+\\d+m`));

    await onServer(`for file in /home/deploy/.pm2/logs/journal-web-${state.active}-out*.log; do echo "a web line" >> $file; done`);
    await onServer(`for file in /home/deploy/.pm2/logs/journal-worker-${state.active}-out*.log; do echo "a worker line" >> $file; done`);
    await onServer(`echo '{"status":204,"uri":"/caddy-line"}' >> /var/log/caddy/journal.access.log`);
    const web = await streamCliUntil(journal.dir, journal.env, "a web line", "logs", "production");
    expect(web).toContain("a web line");
    expect(web).not.toContain("a worker line");
    expect(await streamCliUntil(journal.dir, journal.env, "a worker line", "logs", "production", "--worker")).toContain("a worker line");
    expect(await streamCliUntil(journal.dir, journal.env, "/caddy-line", "logs", "production", "--caddy")).toContain('"uri":"/caddy-line"');
    const both = await journal.logs("production", "--worker", "--caddy");
    expect(both.exitCode).toBe(2);
    expect(both.output).toContain("✖ Pass --worker or --caddy, not both");

    const shell = await runCliWithInput(journal.dir, "pwd\nwhoami\nexit 3\n", journal.env, "ssh", "production");
    expect(shell.exitCode).toBe(3);
    expect(shell.stdout).toContain(`${folder}\ndeploy\n`);
  }, 120000);

  it("shows the server's apps, memory, disk, services and slow queries, and warns when the processes do not fit", async () => {
    const folder = "/srv/apps/journal";
    const journal = appWithFakeSsh(journalOptions);
    const state = (await onServer(`cat ${folder}/state.json`)).output;
    await onServer(`cd / && runuser -u postgres -- psql -X -d journal -c 'select pg_sleep(0.6)'`);

    const json = await journal.serverStatus("production", "--json");
    expect(json.exitCode, json.output).toBe(0);
    const status = JSON.parse(json.output.slice(json.output.indexOf("{"), json.output.lastIndexOf("}") + 1));
    expect(status.services).toEqual({
      postgres: true,
      "redis durable": true,
      "redis cache": true,
      seaweedfs: true,
      caddy: false,
      pm2: true,
    });
    expect(status.apps.find(({ name }: { name: string }) => name === "journal")).toMatchObject({
      color: JSON.parse(state).active,
      release: JSON.parse(state).releases[JSON.parse(state).active],
      backup: null,
    });
    expect(status.slowQueries).toContainEqual(expect.objectContaining({ database: "journal", calls: 1, query: "select pg_sleep($1)" }));
    expect(status.slowLog.join("\n")).toContain("select pg_sleep(0.6)");
    expect(status.warnings).toEqual(["caddy is not answering"]);

    const table = await journal.serverStatus("production");
    expect(table.output).toMatch(/Disk {5}\d+ of \d+ MB \(\d+%\)/);
    expect(table.output).toContain("Services postgres up, redis durable up, redis cache up, seaweedfs up, caddy down, pm2 up");
    expect(table.output).toMatch(/APP\s+RELEASE\s+PROCESSES\s+MEMORY\s+BACKUP/);
    expect(table.output).toMatch(/journal\s+\S+ \((blue|green)\)\s+3\s+1536 of \d+ MB\s+none yet/);
    expect(table.output).toMatch(/journal\s+1\s+\d+ ms\s+select pg_sleep\(\$1\)/);
    expect(table.output).toContain("▲ caddy is not answering");

    await onServer(
      `runuser -u deploy -- node -e 'const f = "${folder}/state.json"; const s = JSON.parse(require("fs").readFileSync(f)); s.processes = { blue: { web: 40, worker: 9 } }; require("fs").writeFileSync(f, JSON.stringify(s))'`,
    );
    const crowded = await journal.serverStatus("production");
    await onServer(`printf '%s' '${state.trim()}' > ${folder}/state.json`);
    expect(crowded.output).toMatch(/▲ \d+ app processes of 512 MB need \d+ MB, the apps have \d+ MB/);
    expect(crowded.output).toMatch(/▲ \d+ processes during a deploy need a connection each, Postgres has 90 for the apps/);
  }, 120000);

  it("monitors the server and its apps every minute, firing an alert once a condition holds long enough and resolving it after", async () => {
    const folder = "/srv/apps/journal";
    const state = JSON.parse((await onServer(`cat ${folder}/state.json`)).output);
    const monitor = async () => {
      const { output, exitCode } = await onServer("/usr/local/lib/nuxvel/monitor");
      expect(exitCode, output).toBe(0);
      return output;
    };
    const backdate = (path: string, minutes: number) =>
      onServer(
        `node -e 'const f = "/var/lib/nuxvel/monitor.json"; const s = JSON.parse(require("fs").readFileSync(f)); const [k, ...rest] = process.argv[1].split("."); let o = s[k]; for (const p of rest.slice(0, -1)) o = o[p]; o[rest.at(-1)] -= ${minutes} * 60000; require("fs").writeFileSync(f, JSON.stringify(s))' '${path}'`,
      );
    const redis = (command: string) => onServer(`REDISCLI_AUTH=$(cat /etc/nuxvel/redis-durable.password) redis-cli -p 6379 --user nuxvel --no-auth-warning ${command}`);
    const owner = (query: string) => onServer(`. ${folder}/shared/owner.env && psql "$NUXT_DATABASE_OWNER_URL" -X -q -c "${query}"`);
    const certs = "/var/lib/caddy/.local/share/caddy/certificates/acme/journal.example.com";
    onTestFinished(async () => {
      await onServer(
        `rm -f /usr/local/sbin/df /var/run/reboot-required /srv/nuxvel/backup-status/journal.json /srv/nuxvel/backup-status/journal.drill.json /etc/systemd/system/nuxvel-journal-restore-drill.timer ${folder}/hold.log; rm -rf ${certs}; ` +
          "runuser -u deploy -- env HOME=/home/deploy pm2 restart /^journal-web-/ > /dev/null 2>&1 || true",
      );
      await redis("del journal:bull:mail:failed journal:bull:mail:wait journal:bull:mail:7 journal:bull:mail:8");
      await owner("drop table if exists outbox; drop table if exists backfills");
    });
    await onServer("rm -f /var/lib/nuxvel/monitor.json /var/log/nuxvel/monitor.log /srv/nuxvel/backup-status/journal.json");

    const first = await monitor();
    expect(first).toContain("critical: Caddy is not answering");
    expect(first).not.toContain("journal");
    const logged = (await onServer("cat /var/log/nuxvel/monitor.log")).output.trim().split("\n").map((line) => JSON.parse(line));
    expect(logged).toContainEqual(expect.objectContaining({ event: "firing", key: "service:caddy", severity: "critical", message: "Caddy is not answering" }));
    expect(await monitor()).not.toContain("Caddy");

    await onServer("runuser -u deploy -- env HOME=/home/deploy pm2 stop /^journal-web-/ > /dev/null");
    expect(await monitor()).not.toContain("health/ready");
    await backdate("conditions.health:journal.since", 3);
    expect(await monitor()).toContain(`critical: journal: /api/health/ready on ${state.active} fails`);
    await onServer("runuser -u deploy -- env HOME=/home/deploy pm2 restart /^journal-web-/ > /dev/null");
    await expect.poll(async () => (await onServer(`curl -fs http://127.0.0.1:${JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output).apps.journal.ports[state.active][0]}/api/health/ready`)).exitCode, { timeout: 30000 }).toBe(0);
    expect(await monitor()).toContain(`resolved: Resolved: journal: /api/health/ready on ${state.active} fails`);

    await onServer(`printf '#!/bin/sh\\necho Use%%\\necho " 91%%"\\n' > /usr/local/sbin/df && chmod 755 /usr/local/sbin/df`);
    expect(await monitor()).toContain("critical: The disk is 91% full");
    await onServer("rm /usr/local/sbin/df");
    expect(await monitor()).toContain("resolved: Resolved: The disk is 91% full");

    await onServer(`touch ${folder}`);
    await backdate("memory.activeSince:journal", 27 * 60);
    expect(await monitor()).toContain("critical: journal has no backup");
    await onServer(`install -d -m 755 /srv/nuxvel/backup-status && echo '{"time":"${new Date().toISOString()}"}' > /srv/nuxvel/backup-status/journal.json`);
    expect(await monitor()).toContain("resolved: Resolved: journal has no backup");

    const twoDaysAgo = new Date(Date.now() - 48 * 3600000).toISOString();
    await onServer(
      `install -d -m 755 /srv/nuxvel/backup-status && echo '{"time":"${twoDaysAgo}","offsite":{"ok":false,"time":"${twoDaysAgo}","error":"403 Forbidden"}}' > /srv/nuxvel/backup-status/journal.json && ` +
        `echo '{"time":"${twoDaysAgo}","from":"20260920T020000Z","ok":false,"problems":["the table public.entries is empty, it had 3 rows"]}' > /srv/nuxvel/backup-status/journal.drill.json`,
    );
    const backups = await monitor();
    expect(backups).toContain(`critical: journal: the newest backup is from ${twoDaysAgo}, over 26 hours ago`);
    expect(backups).toContain("critical: journal: the off-site upload failed: 403 Forbidden");
    expect(backups).toContain("critical: journal: the restore drill of 20260920T020000Z failed: the table public.entries is empty, it had 3 rows");
    const nineDaysAgo = new Date(Date.now() - 9 * 24 * 3600000).toISOString();
    await onServer(
      `touch /etc/systemd/system/nuxvel-journal-restore-drill.timer && echo '{"time":"${nineDaysAgo}","from":"20260918T020000Z","ok":true,"problems":[]}' > /srv/nuxvel/backup-status/journal.drill.json`,
    );
    expect(await monitor()).toContain(`warning: journal: the last restore drill ran on ${nineDaysAgo}, over 8 days ago`);

    const now = Date.now();
    await redis(`hset journal:bull:mail:7 failedReason 'mail.send received payload version 3, newer than the defined version 2' timestamp ${now}`);
    await redis(`zadd journal:bull:mail:failed ${now} 7`);
    await redis(`hset journal:bull:mail:8 timestamp ${now - 20 * 60000}`);
    await redis("lpush journal:bull:mail:wait 8");
    const jobs = await monitor();
    expect(jobs).toContain("warning: journal: the failed jobs grow, 1 now");
    expect(jobs).toContain("critical: journal: a job failed on an incompatible payload: mail.send received payload version 3, newer than the defined version 2");
    expect(jobs).toMatch(/warning: journal: a job has waited in the queue mail for 2\d minutes/);

    await owner("create table outbox (id serial primary key, job_name text not null, payload jsonb, dispatched_at timestamp); insert into outbox (job_name) values ('mail.send')");
    await owner("create table backfills (name text primary key, processed integer not null default 0, total integer not null, completed_at timestamp, updated_at timestamp not null default now()); insert into backfills (name, total, updated_at) values ('fill-slugs', 10, now() - interval '40 minutes')");
    expect(await monitor()).toContain("warning: journal: the backfill fill-slugs has made no progress for 30 minutes");
    await backdate("memory.outbox:journal.since", 2);
    expect(await monitor()).toContain("critical: journal: an outbox row has stayed unsent for over a minute");

    await onServer(`runuser -u deploy -- sh -c 'printf "! a rollback was requested on green: switching back to blue\\n@outcome switched-back\\n" > ${folder}/hold.log'`);
    expect(await monitor()).not.toContain("switched back");
    await onServer(
      `mkdir -p ${certs} && openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout /dev/null -subj /CN=journal.example.com -days 5 -out ${certs}/journal.example.com.crt 2>/dev/null`,
    );
    await onServer(`runuser -u deploy -- sh -c 'echo "@outcome switched-back" > ${folder}/hold.log'`);
    await onServer("touch -d '8 days ago' /var/run/reboot-required");
    const rest = await monitor();
    expect(rest).toMatch(/warning: The TLS certificate of journal\.example\.com expires on \d{4}-\d{2}-\d{2}/);
    expect(rest).toContain("critical: journal: a deploy failed after its switch and switched back");
    expect(rest).toContain("warning: Security updates have waited on a reboot for over 7 days: run nuxvel server:upgrade <env> --reboot");
    expect(await monitor()).toBe("");
  }, 180000);

  it("runs no code from an app's files as root: reads the pool size from the ecosystem file as data and accepts only blue or green as the active color", async () => {
    const folder = "/srv/apps/journal";
    const stateText = (await onServer(`cat ${folder}/state.json`)).output;
    const state = JSON.parse(stateText) as { active: string };
    const ecosystem = `${folder}/ecosystem.${state.active}.config.cjs`;
    const original = (await onServer(`cat ${ecosystem}`)).output;
    const { apps } = JSON.parse(original.replace(/^module\.exports = /, "").replace(/;\s*$/, "")) as {
      apps: { instances: number; env: { NUXT_DATABASE_POOL_MAX: string } }[];
    };
    const expected = apps.reduce((sum, app) => sum + app.instances * Number(app.env.NUXT_DATABASE_POOL_MAX), 0);
    const asDeployWrite = (path: string, contents: string) =>
      onServer(`echo ${Buffer.from(contents).toString("base64")} | base64 -d | runuser -u deploy -- tee ${path} > /dev/null`);
    const poolMetric = async () => {
      const { output, exitCode } = await onServer("/usr/local/lib/nuxvel/monitor");
      expect(exitCode, output).toBe(0);
      return /^nuxvel_db_pool_size\{app="journal"\} (\d+)$/m.exec((await onServer("cat /var/lib/nuxvel-metrics/metrics.prom")).output)?.[1];
    };
    onTestFinished(async () => {
      await asDeployWrite(ecosystem, original);
      await asDeployWrite(`${folder}/state.json`, stateText);
      await onServer("rm -f /tmp/srv01-marker /tmp/evil.config.cjs");
    });

    await asDeployWrite(ecosystem, `require("fs").writeFileSync("/tmp/srv01-marker", String(process.getuid()));\n${original}`);
    expect(await poolMetric()).toBeUndefined();
    expect((await onServer("test -e /tmp/srv01-marker")).exitCode).toBe(1);

    await asDeployWrite(ecosystem, original);
    expect(await poolMetric()).toBe(String(expected));

    await asDeployWrite("/tmp/evil.config.cjs", 'module.exports = {"apps":[{"instances":999,"env":{"NUXT_DATABASE_POOL_MAX":"1"}}]};\n');
    await asDeployWrite(`${folder}/state.json`, JSON.stringify({ ...state, active: "x/../../../../tmp/evil" }));
    expect(await poolMetric()).toBeUndefined();
  }, 60000);

  it("delivers each alert by email and webhook once an hour at most, sends a resolved message, pings the heartbeat and serves metrics", async () => {
    const servicesNetwork = `${TEST_COMPOSE_PROJECT}_default`;
    const mailpitId = (await run("docker", ["compose", "-f", TEST_COMPOSE_FILE, "-p", TEST_COMPOSE_PROJECT, "ps", "-q", "mailpit"], process.cwd())).stdout.trim();
    const mailpitIp = (await run("docker", ["inspect", "-f", `{{(index .NetworkSettings.Networks "${servicesNetwork}").IPAddress}}`, mailpitId], process.cwd())).stdout.trim();
    // The test services publish on the host's 127.0.0.1 only, so the server reaches mailpit on the services' network
    expect((await run("docker", ["network", "connect", servicesNetwork, container], process.cwd())).exitCode).toBe(0);
    onTestFinished(() => run("docker", ["network", "disconnect", servicesNetwork, container], process.cwd()).then(() => undefined));
    const mailpitSmtp = `${mailpitIp}:1025`;
    const alerts = {
      email: "ops@example.com",
      smtp: `smtp://${mailpitSmtp}`,
      webhook: "http://127.0.0.1:8499/alerts",
      heartbeat: "http://127.0.0.1:8499/heartbeat",
    };
    const alerting = appWithFakeSsh({ ...journalOptions, alerts });
    const monitor = async () => (await onServer("/usr/local/lib/nuxvel/monitor")).output;
    const received = async () =>
      (await onServer("cat /tmp/receiver.log 2>/dev/null")).output.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const backdate = (key: string, channel: string) =>
      onServer(
        `node -e 'const f = "/var/lib/nuxvel/monitor.json"; const s = JSON.parse(require("fs").readFileSync(f)); s.conditions["${key}"].sent.${channel} -= 61 * 60000; require("fs").writeFileSync(f, JSON.stringify(s))'`,
      );
    const mails = async (subject: string) => {
      const response = await fetch(`${TEST_MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:ops@example.com subject:"${subject}"`)}`);
      return ((await response.json()) as { messages_count: number }).messages_count;
    };
    await onServer(
      `cat > /tmp/receiver.cjs <<'JS'
require("node:http").createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    require("node:fs").appendFileSync("/tmp/receiver.log", JSON.stringify({ path: request.url, body: body ? JSON.parse(body) : null }) + "\\n");
    response.end("ok");
  });
}).listen(8499, "127.0.0.1");
JS
setsid node /tmp/receiver.cjs > /dev/null 2>&1 &
setsid runuser -u nobody -- node /usr/local/lib/nuxvel/metrics > /dev/null 2>&1 &`,
    );
    onTestFinished(async () => {
      await onServer("pkill -f /tmp/receiver.cjs; pkill -f /usr/local/lib/nuxvel/metrics; rm -f /tmp/receiver.cjs /tmp/receiver.log /usr/local/sbin/df /etc/nuxvel/alerts.json");
      await appWithFakeSsh(journalOptions)("production");
    });

    await fetch(`${TEST_MAILPIT_URL}/api/v1/search?query=${encodeURIComponent("to:ops@example.com")}`, { method: "DELETE" });
    const setUp = await alerting("production");
    expect(setUp.exitCode, setUp.output).toBe(0);
    expect(setUp.output).toContain("~ send the alerts to ops@example.com, the webhook, a heartbeat to the heartbeat URL");
    expect((await onServer("stat -c '%U %a' /etc/nuxvel/alerts.json")).output).toBe("root 600\n");
    const metricsRestarts = async () => (await onServer("grep -c '^restart nuxvel-metrics$' /run/fake-systemctl")).output;
    const restartsBefore = await metricsRestarts();
    await onServer("echo >> /usr/local/lib/nuxvel/metrics");
    expect((await alerting("production")).output).toContain("~ serve the Prometheus metrics of the monitor on 127.0.0.1:9470");
    expect(Number(await metricsRestarts())).toBe(Number(restartsBefore) + 1);

    await onServer("rm -f /var/lib/nuxvel/monitor.json");
    expect(await monitor()).toContain("critical: Caddy is not answering");
    await expect.poll(() => mails("Caddy is not answering"), { timeout: 10000 }).toBe(1);
    const first = await received();
    expect(first.filter(({ path }) => path === "/heartbeat")).toHaveLength(1);
    expect(first.find(({ path, body }) => path === "/alerts" && body.key === "service:caddy")?.body).toMatchObject({
      server: "203.0.113.10",
      event: "firing",
      key: "service:caddy",
      severity: "critical",
      message: "Caddy is not answering",
      repeat: false,
    });

    await monitor();
    const second = await received();
    expect(second.filter(({ path }) => path === "/heartbeat")).toHaveLength(2);
    expect(second.filter(({ path, body }) => path === "/alerts" && body.key === "service:caddy")).toHaveLength(1);
    await backdate("service:caddy", "webhook");
    await monitor();
    const repeated = (await received()).filter(({ path, body }) => path === "/alerts" && body.key === "service:caddy");
    expect(repeated).toHaveLength(2);
    expect(repeated[1]?.body).toMatchObject({ key: "service:caddy", repeat: true });
    expect(await mails("Caddy is not answering")).toBe(1);

    await onServer(`printf '#!/bin/sh\\necho Use%%\\necho " 93%%"\\n' > /usr/local/sbin/df && chmod 755 /usr/local/sbin/df`);
    await monitor();
    await onServer("rm /usr/local/sbin/df");
    await monitor();
    const disk = (await received()).filter(({ path, body }) => path === "/alerts" && body.key === "disk").map(({ body }) => body.event);
    expect(disk).toEqual(["firing", "resolved"]);
    await expect.poll(() => mails("resolved on 203.0.113.10: Resolved: The disk is 93% full"), { timeout: 10000 }).toBe(1);

    const metrics = (await onServer("curl -s http://127.0.0.1:9470/metrics")).output;
    expect(metrics).toContain('nuxvel_service_up{service="caddy"} 0');
    expect(metrics).toContain('nuxvel_service_up{service="postgres"} 1');
    expect(metrics).toContain('nuxvel_app_ready{app="journal"} 1');
    expect(metrics).toMatch(/nuxvel_db_connections\{app="journal"\} \d+/);
    expect(metrics).toMatch(/nuxvel_db_pool_size\{app="journal"\} \d+/);
    expect(metrics).toContain('nuxvel_alert_firing{key="service:caddy",severity="critical"} 1');
    expect(metrics).toMatch(/nuxvel_disk_used_percent \d+/);
    expect((await onServer("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9470/")).output).toBe("404");

    const tested = await alerting.alertsTest("production");
    expect(tested.exitCode, tested.output).toBe(0);
    expect(tested.output).toContain("✔ Sent the test alert through the email");
    expect(tested.output).toContain("✔ Sent the test alert through the webhook");
    expect(tested.output).toContain("✔ Sent the test alert through the heartbeat URL");
    await expect.poll(() => mails("info on 203.0.113.10: A test alert from nuxvel alerts:test"), { timeout: 10000 }).toBe(1);
    expect((await received()).find(({ path, body }) => path === "/alerts" && body.event === "test")?.body).toMatchObject({
      server: "203.0.113.10",
      key: "test",
      message: "A test alert from nuxvel alerts:test",
    });

    await onServer("pkill -f /tmp/receiver.cjs");
    const unreachable = await alerting.alertsTest("production");
    expect(unreachable.exitCode).toBe(1);
    expect(unreachable.output).toContain("✔ Sent the test alert through the email");
    expect(unreachable.output).toMatch(/✖ The webhook failed: curl: \(7\) Failed to connect to 127\.0\.0\.1 port 8499/);
    expect(unreachable.output).toMatch(/✖ The heartbeat URL failed: /);
    await onServer(`printf '#!/bin/sh\\necho Use%%\\necho " 95%%"\\n' > /usr/local/sbin/df && chmod 755 /usr/local/sbin/df`);
    expect(await monitor()).toMatch(/delivery-failed: webhook: /);
    expect((await onServer("tail -n 2 /var/log/nuxvel/monitor.log")).output).toContain('"event":"delivery-failed","channel":"webhook","key":"disk"');

    const kept = await appWithFakeSsh(journalOptions)("production");
    expect(kept.output).not.toContain("sending the alerts");
    expect((await onServer("test -f /etc/nuxvel/alerts.json")).exitCode).toBe(0);
    await onServer("rm /etc/nuxvel/alerts.json");
    const noChannel = await alerting.alertsTest("production");
    expect(noChannel.exitCode).toBe(1);
    expect(noChannel.output).toContain("✖ 203.0.113.10 has no alert channel");
    expect(noChannel.output).toContain("→ Set alerts in nuxvel.deploy.ts and run nuxvel server:setup production");

    const withPassword = JSON.stringify({ server: "203.0.113.10", email: "ops@example.com", smtp: `smtp://alerts:secret@${mailpitSmtp}` });
    await onServer(`printf '%s' '${withPassword}' > /etc/nuxvel/alerts.json`);
    expect((await onServer("/usr/local/lib/nuxvel/monitor --test")).output).toMatch(/^@channel email failed curl: \(64\)/m);

    await onServer("cp /usr/local/lib/nuxvel/monitor /tmp/monitor && printf '#!/bin/sh\\necho critical: Caddy is not answering\\n' > /usr/local/lib/nuxvel/monitor");
    const oldHelper = await alerting.alertsTest("production");
    await onServer("mv /tmp/monitor /usr/local/lib/nuxvel/monitor");
    expect(oldHelper.exitCode).toBe(1);
    expect(oldHelper.output).toContain("/usr/local/lib/nuxvel/monitor is older than alerts:test");
    expect(oldHelper.output).toContain("Run nuxvel server:setup to update it");
  }, 180000);

  it("backs up the database, the buckets and the config bundle of an app, keeping 7 daily, 4 weekly and 12 monthly backups", async () => {
    const journal = appWithFakeSsh(journalOptions);
    const folder = "/srv/nuxvel/backups/journal";
    const filer = "http://127.0.0.1:8888/buckets/journal-private";
    await onServer("cp /etc/nuxvel/recovery.pub /tmp/recovery.pub && age-keygen -o /tmp/backup-recovery.key 2>/dev/null && age-keygen -y /tmp/backup-recovery.key > /etc/nuxvel/recovery.pub");
    onTestFinished(async () => {
      await onServer(`mv /tmp/recovery.pub /etc/nuxvel/recovery.pub && rm -rf /tmp/backup-recovery.key /tmp/config ${folder}`);
    });
    await onServer(`printf hello > /tmp/note.txt && curl -s -o /dev/null -T /tmp/note.txt ${filer}/docs/note.txt`);
    await onServer(`printf hash > /tmp/hash.txt && curl -fsS -o /dev/null -T /tmp/hash.txt ${filer}/docs/a%23b%3F.txt`);
    await onServer(loadDotDotEntry("/buckets/journal-private/docs"));
    onTestFinished(async () => {
      await onServer(`curl -s -o /dev/null -X DELETE '${filer}/docs?recursive=true'`);
    });
    const monthsAgo = (months: number) => {
      const date = new Date();
      date.setUTCDate(15);
      date.setUTCMonth(date.getUTCMonth() - months);
      return `${date.toISOString().slice(0, 10).replaceAll("-", "")}T020000Z`;
    };
    const old = Array.from({ length: 15 }, (_, index) => monthsAgo(index + 1));
    await onServer(
      `install -d -m 700 /srv/nuxvel/backups ${folder} && cd ${folder} && for stamp in ${old.join(" ")}; do touch database-$stamp.dump config-$stamp.tar.age; done`,
    );

    const first = await journal.backup("production");
    expect(first.exitCode, first.output).toBe(0);
    const stamp = /✔ Backed up journal on 203\.0\.113\.10 to \/srv\/nuxvel\/backups\/journal\/, as of (\d{8}T\d{6}Z)/.exec(first.output)?.[1];
    expect(stamp, first.output).toBeDefined();
    expect(first.output).toMatch(new RegExp(`~ dump the database journal to ${folder}/database-${stamp}\\.dump \\(\\d+\\.\\d MB\\)`));
    expect(first.output).toContain(`~ sync the bucket journal-private to ${folder}/buckets/journal-private: 2 files, 2 copied, 0 removed`);
    expect(first.output).toContain(`~ write the config bundle ${folder}/config-${stamp}.tar.age, encrypted to the recovery key`);
    for (const removed of old.slice(11)) expect(first.output).toContain(`~ remove the backup of ${removed}, past the retention`);
    for (const kept of old.slice(0, 11)) expect(first.output).not.toContain(`~ remove the backup of ${kept}`);
    expect((await onServer(`ls ${folder} | grep -c '^database-.*\\.dump$'`)).output).toBe("12\n");

    expect((await onServer(`stat -c '%U %a' ${folder} ${folder}/database-${stamp}.dump ${folder}/config-${stamp}.tar.age`)).output).toBe(
      "root 700\nroot 600\nroot 600\n",
    );
    expect((await onServer(`cat ${folder}/buckets/journal-private/docs/note.txt '${folder}/buckets/journal-private/docs/a#b?.txt'`)).output).toBe("hellohash");
    expect((await onServer(`pg_restore -l ${folder}/database-${stamp}.dump | grep -c 'TABLE public entries'`)).output).not.toBe("0\n");
    const state = JSON.parse((await onServer("cat /srv/apps/journal/state.json")).output);
    const bundle = await onServer(
      `mkdir -p /tmp/config && age -d -i /tmp/backup-recovery.key ${folder}/config-${stamp}.tar.age | tar -x -C /tmp/config && cd /tmp/config && ` +
        "ls -A . shared && grep -c '^NUXT_DATABASE_URL=' shared/.env && node -p 'require(\"./server.json\").apps.journal.folder'",
    );
    expect(bundle.output).toContain(`${state.releases[state.active]}.tar.gz`);
    expect(bundle.output).toMatch(/journal\.caddy\nserver\.json\nshared\nstate\.json\n/);
    expect(bundle.output).toContain("shared:\n.env\nowner.env\n");
    expect(bundle.output).toContain("1\n/srv/apps/journal\n");
    expect(JSON.parse((await onServer("cat /srv/nuxvel/backup-status/journal.json")).output)).toMatchObject({ stamp, buckets: { "journal-private": 2 } });
    expect((await onServer("stat -c '%a' /srv/nuxvel/backup-status/journal.json")).output).toBe("644\n");
    expect((await journal.status("production")).output).toMatch(/Backup {3}\d{4}-\d{2}-\d{2}T/);

    await onServer(`curl -s -o /dev/null -X DELETE ${filer}/docs/note.txt && curl -s -o /dev/null -X DELETE ${filer}/docs/a%23b%3F.txt`);
    const second = await journal.backup("production");
    expect(second.exitCode, second.output).toBe(0);
    expect(second.output).toContain(`~ sync the bucket journal-private to ${folder}/buckets/journal-private: 0 files, 0 copied, 2 removed`);
    expect((await onServer(`test -e ${folder}/buckets/journal-private/docs/note.txt`)).exitCode).not.toBe(0);

    await onServer(
      "cp /srv/nuxvel/server.json /tmp/server.json && " +
        `node -e 'const r = require("/tmp/server.json"); r.apps = { journal: r.apps.journal, "journal-rehearsal": r.apps.journal }; require("fs").writeFileSync("/srv/nuxvel/server.json", JSON.stringify(r))'`,
    );
    const nightly = await onServer("/usr/local/lib/nuxvel/backup 2>&1");
    await onServer("mv /tmp/server.json /srv/nuxvel/server.json && rm -rf /srv/nuxvel/backups/journal-rehearsal /srv/nuxvel/backup-status/journal-rehearsal.json");
    expect(nightly.exitCode, nightly.output).toBe(0);
    expect(nightly.output).toContain('@backup {"app":"journal"');
    expect(nightly.output).not.toContain("journal-rehearsal");
  }, 120000);

  it("runs the monitor and backup app SQL as a non-superuser, so an app owner cannot escalate to Postgres superuser", async () => {
    const folder = "/srv/apps/journal";
    const journal = appWithFakeSsh(journalOptions);
    const owner = (query: string) => onServer(`. ${folder}/shared/owner.env && psql "$NUXT_DATABASE_OWNER_URL" -X -q -v ON_ERROR_STOP=1 -c "${query.replaceAll("$", "\\$")}"`);
    const rolsuper = async () => (await onServer(`cd / && runuser -u postgres -- psql -X -tA -c "select rolsuper from pg_roles where rolname = 'journal_owner'"`)).output.trim();
    onTestFinished(async () => {
      await owner("drop view if exists outbox; drop function if exists public.pwn(); drop function if exists public.format(text, name, name)");
      await onServer(`cd / && runuser -u postgres -- psql -X -c "alter role journal_owner nosuperuser"`);
      await onServer("rm -rf /srv/nuxvel/backups/journal /srv/nuxvel/backup-status/journal.json");
    });

    expect(await rolsuper()).toBe("f");
    const planted = await owner(
      "create function public.pwn() returns int language plpgsql as $$ begin begin execute 'alter role journal_owner superuser'; exception when others then null; end; return null; end $$; " +
        "create view outbox as select public.pwn() as id, null::timestamptz as dispatched_at; " +
        "create function public.format(text, name, name) returns text language plpgsql as $$ begin begin execute 'alter role journal_owner superuser'; exception when others then null; end; return pg_catalog.format($1, $2, $3); end $$",
    );
    expect(planted.exitCode, planted.output).toBe(0);

    await onServer("/usr/local/lib/nuxvel/monitor");
    expect(await rolsuper(), "the monitor ran the outbox query as the superuser").toBe("f");

    const backedUp = await journal.backup("production");
    expect(await rolsuper(), "the backup ran the row-count query as the superuser").toBe("f");
    expect(backedUp.exitCode, backedUp.output).toBe(0);
  }, 120000);

  it("connects the root helpers to an app's database with fixed settings, taking only the password from the env files", async () => {
    const shared = "/srv/apps/journal/shared";
    const journal = appWithFakeSsh(journalOptions);
    const ssl = async () => (await onServer("cd / && runuser -u postgres -- psql -X -tAc 'show ssl'")).output.trim();
    const read = async (file: string) => (await onServer(`cat ${shared}/${file}`)).output;
    const original = { ".env": await read(".env"), "owner.env": await read("owner.env") };
    const write = (file: keyof typeof original, content: string) => onServer(`runuser -u deploy -- sh -c "cat > ${shared}/${file}" <<'NUXVEL_EOF'\n${content}NUXVEL_EOF`);
    const withKeylog = (file: keyof typeof original, path: string) =>
      write(file, original[file].replace(/^(NUXT_DATABASE(?:_OWNER)?_URL=.*)$/m, `$1?sslmode=require&sslkeylogfile=${path}`));
    const wasOn = (await ssl()) === "on";
    if (!wasOn) await onServer(`cd / && runuser -u postgres -- psql -X -c "alter system set ssl = on" -c "select pg_reload_conf()"`);
    onTestFinished(async () => {
      await onServer("rm -f /root/keylog-monitor /root/keylog-backup /srv/nuxvel/backup-status/journal.json; rm -rf /srv/nuxvel/backups/journal");
      await write(".env", original[".env"]);
      await write("owner.env", original["owner.env"]);
      if (!wasOn) await onServer(`cd / && runuser -u postgres -- psql -X -c "alter system reset ssl" -c "select pg_reload_conf()"`);
    });
    await onServer("rm -f /root/keylog-monitor /root/keylog-backup");
    await withKeylog(".env", "/root/keylog-monitor");
    await withKeylog("owner.env", "/root/keylog-backup");
    expect((await onServer(`grep -c sslkeylogfile ${shared}/.env ${shared}/owner.env`)).output).toContain("owner.env:1");

    expect((await onServer("/usr/local/lib/nuxvel/monitor")).exitCode).toBe(0);
    const backedUp = await journal.backup("production");
    expect(backedUp.exitCode, backedUp.output).toBe(0);
    expect((await onServer("test -e /root/keylog-monitor")).exitCode, "root wrote the key log file from the app URL in the monitor").not.toBe(0);
    expect((await onServer("test -e /root/keylog-backup")).exitCode, "root wrote the key log file from the owner URL in the backup").not.toBe(0);
  }, 120000);

  it("refuses a release name or color from state.json that is not one nuxvel makes, and writes no tarball outside the backup", async () => {
    const folder = "/srv/apps/journal";
    const stateText = (await onServer(`cat ${folder}/state.json`)).output;
    const state = JSON.parse(stateText) as { active: string; releases: Record<string, string | null> };
    const asDeployWrite = (path: string, contents: string) =>
      onServer(`echo ${Buffer.from(contents).toString("base64")} | base64 -d | runuser -u deploy -- tee ${path} > /dev/null`);
    onTestFinished(async () => {
      await asDeployWrite(`${folder}/state.json`, stateText);
      await onServer("rm -rf /etc/nuxvel.tar.gz /srv/nuxvel/backups/journal");
    });

    await asDeployWrite(`${folder}/state.json`, JSON.stringify({ ...state, releases: { ...state.releases, [state.active]: "../../../../etc/nuxvel" } }));
    const traversal = await onServer("/usr/local/lib/nuxvel/backup journal 2>&1");
    expect(traversal.exitCode, traversal.output).toBe(1);
    expect(traversal.output).toContain('names the active release "../../../../etc/nuxvel", which is not a release name');
    expect((await onServer("test -e /etc/nuxvel.tar.gz")).exitCode).toBe(1);

    await asDeployWrite(`${folder}/state.json`, JSON.stringify({ ...state, active: "x/../../../../etc/nuxvel" }));
    const color = await onServer("/usr/local/lib/nuxvel/backup journal 2>&1");
    expect(color.exitCode, color.output).toBe(1);
    expect(color.output).toContain("which is not blue or green");
  }, 60000);

  it("uploads each backup off-site with the dump encrypted, keeps the target after a setup without one, and warns in setup, deploys and status without a target", async () => {
    const folder = "/srv/nuxvel/backups/journal";
    const keys = (await onServer(". /etc/nuxvel/seaweedfs.env && echo $AWS_ACCESS_KEY_ID $AWS_SECRET_ACCESS_KEY")).output.trim().split(" ");
    const offsite = { endpoint: "http://127.0.0.1:8333", bucket: "offsite-backups", accessKeyId: keys[0] ?? "", secretAccessKey: keys[1] ?? "" };
    const journal = appWithFakeSsh({ ...journalOptions, backups: { offsite } });
    const remote = (command: string) => onServer(`set -a && . /etc/nuxvel/offsite.env && rclone ${command}`);
    await onServer("cp /etc/nuxvel/recovery.pub /tmp/recovery.pub && age-keygen -o /tmp/offsite-recovery.key 2>/dev/null && age-keygen -y /tmp/offsite-recovery.key > /etc/nuxvel/recovery.pub");
    onTestFinished(async () => {
      await onServer(`mv /tmp/recovery.pub /etc/nuxvel/recovery.pub && rm -rf /tmp/offsite-recovery.key ${folder} /etc/nuxvel/offsite.env /etc/nuxvel/offsite-versions-tried`);
      await appWithFakeSsh()("production");
    });

    await onServer(
      "printf '%s\\n' 's3.configure -user=offsite-reader -access_key=offsite-reader -secret_key=reader-secret -buckets=offsite-backups -actions=Read,List -apply' " +
        "'s3.configure -user=offsite-dollar -access_key=offsite-dollar -secret_key=se$cret -actions=Admin -apply' | weed shell -master=127.0.0.1:9333",
    );
    const refused = await appWithFakeSsh({ ...journalOptions, backups: { offsite: { ...offsite, secretAccessKey: "wrong" } } })("production");
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain("The off-site bucket offsite-backups refused the credentials of backups.offsite:");
    expect((await onServer("ls /etc/nuxvel")).output).not.toContain("offsite");

    const setUp = await journal("production");
    expect(setUp.exitCode, setUp.output).toBe(0);
    expect(setUp.output).toContain("~ upload the backups to the off-site bucket offsite-backups");
    expect(setUp.output).not.toContain("No off-site backup target");
    expect((await onServer("stat -c '%U %a' /etc/nuxvel/offsite.env")).output).toBe("root 600\n");
    const again = await journal("production");
    expect(again.exitCode, again.output).toBe(0);
    expect(again.output).not.toContain("~ keep the versions");
    expect(again.output).not.toContain("~ upload the backups to the off-site bucket");
    const fakeRclone = `#!/bin/sh\nif [ "$1 $2" = "backend versioning" ]; then [ -n "$4" ] && exit 1; echo '"Unversioned"'; exit 0; fi\nexec /usr/bin/rclone "$@"\n`;
    await onServer(`printf '%s' '${fakeRclone.replaceAll("'", "'\\''")}' > /usr/local/bin/rclone && chmod 755 /usr/local/bin/rclone`);
    const unversioned = await journal("production");
    const unversionedAgain = await journal("production");
    await onServer("rm /usr/local/bin/rclone");
    expect(unversioned.output).toContain("~ keep the versions of the files in the off-site bucket offsite-backups");
    expect(unversioned.output).toContain("▲ The off-site bucket offsite-backups cannot keep versions");
    expect(unversionedAgain.exitCode, unversionedAgain.output).toBe(0);
    expect(unversionedAgain.output).not.toContain("~ keep the versions");
    expect(unversionedAgain.output).toContain("▲ The off-site bucket offsite-backups cannot keep versions");

    const readOnly = await appWithFakeSsh({ ...journalOptions, backups: { offsite: { ...offsite, accessKeyId: "offsite-reader", secretAccessKey: "reader-secret" } } })("production");
    expect(readOnly.exitCode).toBe(1);
    expect(readOnly.output).toContain("The off-site bucket offsite-backups refused the credentials of backups.offsite:");
    const dollar = await appWithFakeSsh({ ...journalOptions, backups: { offsite: { ...offsite, accessKeyId: "offsite-dollar", secretAccessKey: "se$cret" } } })("production");
    expect(dollar.exitCode, dollar.output).toBe(0);
    expect((await onServer("grep -c \"^RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY='se\\$cret'$\" /etc/nuxvel/offsite.env")).output).toBe("1\n");
    expect((await journal("production")).exitCode).toBe(0);

    await onServer("printf offsite > /tmp/offsite.txt && curl -s -o /dev/null -T /tmp/offsite.txt http://127.0.0.1:8888/buckets/journal-private/offsite.txt");
    onTestFinished(async () => {
      await onServer("curl -s -o /dev/null -X DELETE http://127.0.0.1:8888/buckets/journal-private/offsite.txt");
    });
    const onlyOffsite = Array.from({ length: 15 }, (_, index) => {
      const date = new Date();
      date.setUTCDate(15);
      date.setUTCMonth(date.getUTCMonth() - index - 1);
      return `${date.toISOString().slice(0, 10).replaceAll("-", "")}T020000Z`;
    });
    for (const old of onlyOffsite) {
      await onServer(`set -a && . /etc/nuxvel/offsite.env && printf '{}' | rclone rcat offsite:offsite-backups/journal/database-${old}.json`);
    }
    const backedUp = await journal.backup("production");
    expect(backedUp.exitCode, backedUp.output).toBe(0);
    expect(backedUp.output).toContain("~ upload the backup to offsite:offsite-backups/journal, with the database dump encrypted to the recovery key");
    const stamp = /as of (\d{8}T\d{6}Z)/.exec(backedUp.output)?.[1];
    const files = (await remote("lsf -R offsite:offsite-backups/journal")).output;
    for (const kept of onlyOffsite.slice(0, 11)) expect(files).toContain(`database-${kept}.json\n`);
    for (const removed of onlyOffsite.slice(11)) expect(files).not.toContain(`database-${removed}.json`);
    expect(files).toContain(`database-${stamp}.dump.age\n`);
    expect(files).toContain(`config-${stamp}.tar.age\n`);
    expect(files).not.toContain(".dump\n");
    expect(files).toContain("buckets/journal-private/offsite.txt\n");
    const restored = await remote(
      `cat offsite:offsite-backups/journal/database-${stamp}.dump.age | age -d -i /tmp/offsite-recovery.key | pg_restore -l | grep -c 'TABLE public entries'`,
    );
    expect(restored.output).not.toBe("0\n");
    const status = await journal.status("production");
    expect(status.output).toMatch(/Off-site uploaded \d{4}-/);
    expect(status.output).not.toContain("no off-site backup target");

    await onServer("cp /etc/nuxvel/offsite.env /tmp/offsite.env && sed -i 's/^RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=.*/RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=\"wrong\"/' /etc/nuxvel/offsite.env");
    const failed = await journal.backup("production");
    await onServer("mv /tmp/offsite.env /etc/nuxvel/offsite.env");
    expect(failed.exitCode).toBe(1);
    expect(failed.output).toContain("The backup of journal failed: the off-site upload failed, the backup stays on this server");
    const failedStatus = await journal.status("production");
    expect(failedStatus.output).toMatch(/Off-site failed \d{4}-/);
    expect(failedStatus.output).toContain("▲ The last off-site upload failed, the newest backup is only on the server");

    const erasure = (id: string) => onServer(`cd / && runuser -u deploy -- sudo -n /usr/local/lib/nuxvel/erasure journal ${id} 2>&1`);
    await onServer("rm -f /srv/nuxvel/erasures/journal.jsonl");
    expect((await erasure("u_erased_1")).exitCode).toBe(0);
    expect((await onServer("stat -c '%U %a' /srv/nuxvel/erasures /srv/nuxvel/erasures/journal.jsonl")).output).toBe("root 700\nroot 600\n");
    expect((await onServer("cat /srv/nuxvel/erasures/journal.jsonl")).output).toMatch(/^\{"time":"\d{4}-[^"]+","id":"u_erased_1"\}\n$/);
    const uploaded = (await remote("lsf offsite:offsite-backups/journal/erasures")).output.split("\n").filter((name) => name.endsWith(".json"));
    expect(uploaded, uploaded.join(", ")).toHaveLength(1);
    expect((await remote(`cat offsite:offsite-backups/journal/erasures/${uploaded[0]}`)).output).toContain('"id":"u_erased_1"');
    const badId = await erasure("'two words'");
    expect(badId.exitCode).toBe(2);
    expect(badId.output).toContain("Usage: erasure <app> <user id>");

    await onServer("cp /etc/nuxvel/offsite.env /tmp/offsite.env && sed -i 's/^RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=.*/RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=\"wrong\"/' /etc/nuxvel/offsite.env");
    const unreachable = await erasure("u_erased_2");
    await onServer("mv /tmp/offsite.env /etc/nuxvel/offsite.env");
    expect(unreachable.exitCode).toBe(1);
    expect(unreachable.output).toContain("The off-site upload of the erasure failed");

    const kept = await appWithFakeSsh(journalOptions)("production");
    expect(kept.exitCode, kept.output).toBe(0);
    expect(kept.output).not.toContain("off-site");
    expect((await onServer("test -f /etc/nuxvel/offsite.env")).exitCode).toBe(0);
    await onServer("rm /etc/nuxvel/offsite.env");
    const none = await appWithFakeSsh(journalOptions)("production");
    expect(none.output).toContain("▲ No off-site backup target: the backups stay on this server, and are lost with it. Set backups.offsite in nuxvel.deploy.ts");
    expect((await appWithFakeSsh(journalOptions).status("production")).output).toContain(
      "▲ production has no off-site backup target: the backups stay on 203.0.113.10, and are lost with it",
    );
  }, 300000);

  it("restores a backup into a new database or a given one, checks its migrations and row counts, and drills it every week when set", async () => {
    const journal = appWithFakeSsh(journalOptions);
    const shared = "/srv/apps/journal/shared";
    const sql = (database: string, query: string) => onServer(`cd / && runuser -u postgres -- psql -X -tA -d ${database} -c "${query}"`);
    onTestFinished(async () => {
      await onServer(
        "cd / && for db in $(runuser -u postgres -- psql -X -tA -c \"select datname from pg_database where datname like 'journal_restored_%' or datname = 'journal_copy'\"); do runuser -u postgres -- dropdb --force $db; done; rm -rf /srv/nuxvel/backups/journal /srv/nuxvel/backup-status/journal.drill.json",
      );
    });
    await onServer(`. ${shared}/owner.env && psql "$NUXT_DATABASE_OWNER_URL" -X -q -c "truncate entries; insert into entries default values; insert into entries default values; insert into entries default values"`);
    const backedUp = await journal.backup("production");
    expect(backedUp.exitCode, backedUp.output).toBe(0);
    const stamp = /as of (\d{8}T\d{6}Z)/.exec(backedUp.output)?.[1] ?? "";
    const restoredName = `journal_restored_${stamp.toLowerCase()}`;
    await onServer(`mkdir -p /srv/nuxvel/erasures && echo '{"time":"2000-01-01T00:00:00.000Z","id":"u_before_backup"}' >> /srv/nuxvel/erasures/journal.jsonl`);
    expect((await onServer("cd / && runuser -u deploy -- sudo -n /usr/local/lib/nuxvel/erasure journal u_after_backup")).exitCode).toBe(0);

    const ownerEnv = (await onServer(`cat ${shared}/owner.env`)).output;
    const writeOwnerEnv = (content: string) => onServer(`runuser -u deploy -- sh -c "cat > ${shared}/owner.env" <<'NUXVEL_EOF'\n${content}NUXVEL_EOF`);
    onTestFinished(async () => {
      await writeOwnerEnv(ownerEnv);
      await onServer("rm -f /root/keylog-restore");
    });
    await onServer("rm -f /root/keylog-restore");
    await writeOwnerEnv(ownerEnv.replace(/^(NUXT_DATABASE_OWNER_URL=.*)$/m, "$1?sslmode=require&sslkeylogfile=/root/keylog-restore"));

    const restored = await journal.restore("production");
    expect(restored.exitCode, restored.output).toBe(0);
    expect((await onServer("test -e /root/keylog-restore")).exitCode, "root wrote the key log file from the owner URL in the restore").not.toBe(0);
    await writeOwnerEnv(ownerEnv);
    expect(restored.output).toContain(`~ erase again 1 user erased after the backup, in the new database ${restoredName}`);
    expect((await sql(restoredName, "select id || ' ' || log from erased_again")).output).toBe("u_after_backup \n");
    expect((await sql("journal", "select to_regclass('erased_again') is null")).output).toBe("t\n");
    expect(restored.output).toContain(`~ restore /srv/nuxvel/backups/journal/database-${stamp}.dump into the new database ${restoredName}`);
    expect(restored.output).toContain("  1 migrations applied, 1 at the backup");
    expect(restored.output).toContain("  public.entries: 3 rows, 3 at the backup");
    expect(restored.output).toContain(`✔ Restored the backup ${stamp} of journal into the new database ${restoredName} on 203.0.113.10, the live database is untouched`);
    expect((await sql(restoredName, "select tableowner from pg_tables where tablename = 'entries'")).output).toBe("journal_owner\n");
    const runtime = await onServer(`. ${shared}/.env && psql "$(echo "$NUXT_DATABASE_URL" | sed 's|/journal$|/${restoredName}|')" -X -tA -c 'select count(*) from entries'`);
    expect(runtime.output).toBe("3\n");

    const again = await journal.restore("production", `--from=${stamp}`);
    expect(again.exitCode).toBe(1);
    expect(again.output).toContain(`The database ${restoredName} already exists`);
    const malformed = await journal.restore("production", "--from=yesterday");
    expect(malformed.exitCode).toBe(2);
    expect(malformed.output).toContain('✖ --from must be latest or the time of a backup like 20260927T020312Z, got "yesterday"');
    const unknown = await journal.restore("production", "--from=20200101T000000Z");
    expect(unknown.exitCode).toBe(1);
    expect(unknown.output).toContain(`journal has no backup of 20200101T000000Z, pick one of: latest, ${stamp}`);

    await onServer("cd / && runuser -u postgres -- createdb -O journal_owner journal_copy");
    const ownerUrl = (await onServer(`. ${shared}/owner.env && echo "$NUXT_DATABASE_OWNER_URL" | sed 's|/journal$|/journal_copy|'`)).output.trim();
    const copied = await journal.restore("production", `--to=${ownerUrl}`);
    expect(copied.exitCode, copied.output).toBe(0);
    expect(copied.output).toContain("✔ Restored the backup");
    expect((await sql("journal_copy", "select count(*) from entries")).output).toBe("3\n");

    const drill = await onServer("/usr/local/lib/nuxvel/restore journal --drill");
    expect(drill.exitCode, drill.output).toBe(0);
    expect(JSON.parse((await onServer("cat /srv/nuxvel/backup-status/journal.drill.json")).output)).toMatchObject({ from: stamp, ok: true, problems: [] });
    expect((await sql("postgres", "select count(*) from pg_database where datname = 'journal_drill'")).output).toBe("0\n");
    await onServer(`sed -i 's/"drizzle.__drizzle_migrations": 1/"drizzle.__drizzle_migrations": 5/' /srv/nuxvel/backups/journal/database-${stamp}.json`);
    const failedDrill = await onServer("/usr/local/lib/nuxvel/restore journal --drill");
    expect(failedDrill.exitCode).toBe(1);
    expect(failedDrill.output).toContain("The restored database fails its check: drizzle.__drizzle_migrations has 1 migrations, the backup had 5");
    expect(JSON.parse((await onServer("cat /srv/nuxvel/backup-status/journal.drill.json")).output)).toMatchObject({ ok: false });
    expect((await sql("postgres", "select count(*) from pg_database where datname = 'journal_drill'")).output).toBe("0\n");
    await onServer(`cd / && runuser -u postgres -- dropdb --force ${restoredName}`);
    const failedRestore = await journal.restore("production");
    expect(failedRestore.exitCode).toBe(1);
    expect(failedRestore.output).toContain(`The restore dropped the new database ${restoredName}, so no copy with the rows of erased users stays`);
    expect((await sql("postgres", `select count(*) from pg_database where datname = '${restoredName}'`)).output).toBe("0\n");

    const drilled = await appWithFakeSsh({ ...journalOptions, backups: { restoreDrill: true } }).createApp("production");
    expect(drilled.output).toContain("~ restore the newest backup of journal into a scratch database every week with the timer nuxvel-journal-restore-drill");
    expect((await onServer("grep ExecStart /etc/systemd/system/nuxvel-journal-restore-drill.service")).output).toBe(
      "ExecStart=/usr/local/lib/nuxvel/restore journal --drill\n",
    );
    const journalTimers = async () => JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output).apps.journal.timers;
    expect(await journalTimers()).toEqual(["nuxvel-journal-maintenance.timer", "nuxvel-journal-restore-drill.timer"]);
    expect((await journal.createApp("production")).output).toContain("~ remove the timer nuxvel-journal-restore-drill");
    expect(await journalTimers()).toEqual(["nuxvel-journal-maintenance.timer"]);
  }, 180000);

  it("rebuilds a lost app from the off-site backups: its registry entry, database, files, release, processes and Caddy site", async () => {
    const folder = "/srv/apps/journal";
    const keys = (await onServer(". /etc/nuxvel/seaweedfs.env && echo $AWS_ACCESS_KEY_ID $AWS_SECRET_ACCESS_KEY")).output.trim().split(" ");
    const offsite = { endpoint: "http://127.0.0.1:8333", bucket: "restore-backups", accessKeyId: keys[0] ?? "", secretAccessKey: keys[1] ?? "" };
    await onServer("cp /etc/nuxvel/recovery.pub /tmp/recovery.pub && age-keygen -o /tmp/restore-recovery.key 2>/dev/null && age-keygen -y /tmp/restore-recovery.key > /etc/nuxvel/recovery.pub");
    const recoveryKey = (await onServer("grep '^AGE-SECRET-KEY-' /tmp/restore-recovery.key")).output.trim();
    clearEnvAfterTest("NUXVEL_RECOVERY_KEY");
    process.env.NUXVEL_RECOVERY_KEY = recoveryKey;
    const journal = appWithFakeSsh({ ...journalOptions, backups: { offsite } });
    onTestFinished(async () => {
      await onServer("mv /tmp/recovery.pub /etc/nuxvel/recovery.pub && rm -rf /tmp/restore-recovery.key /srv/nuxvel/backups/journal /etc/nuxvel/offsite.env /etc/nuxvel/offsite-versions-tried");
      await appWithFakeSsh(journalOptions)("production");
    });
    const asDeploy = "runuser -u deploy -- env HOME=/home/deploy";

    expect((await journal("production")).exitCode).toBe(0);
    await onServer(`. ${folder}/shared/owner.env && psql "$NUXT_DATABASE_OWNER_URL" -X -q -c "truncate entries; insert into entries default values; insert into entries default values"`);
    await onServer("printf restored > /tmp/restored.txt && curl -s -o /dev/null -T /tmp/restored.txt http://127.0.0.1:8888/buckets/journal-private/restored.txt");
    const backedUp = await journal.backup("production");
    expect(backedUp.exitCode, backedUp.output).toBe(0);
    const stamp = /as of (\d{8}T\d{6}Z)/.exec(backedUp.output)?.[1];
    await onServer(
      `set -a && . /etc/nuxvel/offsite.env && printf '%s\\n' '{"time":"2000-01-01T00:00:00.000Z","id":"u_before_server_backup"}' | rclone rcat offsite:restore-backups/journal/erasures/20000101T000000000Z-old.json 2>/dev/null`,
    );
    expect((await onServer("cd / && runuser -u deploy -- sudo -n /usr/local/lib/nuxvel/erasure journal u_after_server_backup")).exitCode).toBe(0);
    await onServer(
      "set -a && . /etc/nuxvel/offsite.env && for file in config-20000101T000000Z.tar.age database-20000101T000000Z.dump.age; do echo junk | rclone rcat offsite:restore-backups/gone/$file; done",
    );
    const registryBefore = JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output);
    const state = JSON.parse((await onServer(`cat ${folder}/state.json`)).output);
    const port = registryBefore.apps.journal.ports[state.active][0];
    const release = state.releases[state.active];

    await onServer(
      `${asDeploy} pm2 delete '/^journal-/' > /dev/null && ${asDeploy} pm2 save > /dev/null && ` +
        "cd / && runuser -u postgres -- dropdb --force journal && runuser -u postgres -- psql -X -q -c 'drop role journal_app; drop role journal_owner' && " +
        "printf 's3.bucket.delete -name journal-private\\ns3.bucket.delete -name journal-public\\n' | weed shell -master=127.0.0.1:9333 > /dev/null && " +
        `rm -rf ${folder} /etc/caddy/sites/journal.caddy /srv/nuxvel/backups/journal /srv/nuxvel/erasures /etc/nuxvel/recovery.pub && ` +
        `node -e 'const f = "/srv/nuxvel/server.json"; const r = JSON.parse(require("fs").readFileSync(f)); delete r.apps.journal; require("fs").writeFileSync(f, JSON.stringify(r, null, 2))'`,
    );
    expect((await onServer(`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${port}/api/health/ready`)).output).toBe("000");

    await onServer("rm -f /tmp/leaked-env.log");
    const restored = await journal.serverRestore("production");
    expect(restored.exitCode, restored.output).toBe(0);
    expect(restored.output).toMatch(/~ use the recovery key age1/);
    expect(restored.output).toContain(`~ skip gone: the registry of the newest backup ${stamp} has no entry for it, so it was destroyed before`);
    expect(restored.output).toMatch(new RegExp(`~ download and decrypt the config bundle ${stamp} of journal \\(\\d+\\.\\ds\\)`));
    expect(restored.output).toContain(`Restoring journal from its backup ${stamp}`);
    expect(restored.output).toContain("~ create the database role journal_owner");
    expect(restored.output).toContain(`~ restore the database journal from the backup ${stamp}`);
    expect(restored.output).toContain("~ restore the files of the bucket journal-private");
    expect(restored.output).toMatch(/~ erase again 1 user erased after the backup \(\d+\.\ds\)/);
    expect((await onServer(`. ${folder}/shared/owner.env && psql "$NUXT_DATABASE_OWNER_URL" -X -tA -c "select id || ' ' || log from erased_again"`)).output).toBe(
      "u_after_server_backup \n",
    );
    expect((await onServer("cut -d, -f2 /srv/nuxvel/erasures/journal.jsonl")).output).toBe('"id":"u_before_server_backup"}\n"id":"u_after_server_backup"}\n');
    expect(restored.output).toContain(`~ start journal on ${state.active} with ${release}`);
    expect(restored.output).toContain(`Caddy serves journal from ${state.active} on 127.0.0.1:${port}`);
    expect(restored.output).toMatch(/✔ Restored journal on 203\.0\.113\.10 in \d+\.\d min/);
    expect((await onServer(`${asDeploy} pm2 jlist`)).output).not.toContain("RCLONE_CONFIG_");
    expect((await onServer("cat /tmp/leaked-env.log 2>/dev/null || true")).output).toBe("");

    const registryAfter = JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output);
    expect(registryAfter.apps.journal.ports).toEqual(registryBefore.apps.journal.ports);
    expect(Object.keys(registryAfter.apps).sort()).toEqual(Object.keys(registryBefore.apps).sort());
    expect((await onServer("age-keygen -y /tmp/restore-recovery.key | cmp - /etc/nuxvel/recovery.pub")).exitCode).toBe(0);
    expect((await onServer(`. ${folder}/shared/.env && psql "$NUXT_DATABASE_URL" -X -tA -c 'select count(*) from entries'`)).output).toBe("2\n");
    expect((await onServer("curl -s http://127.0.0.1:8888/buckets/journal-private/restored.txt")).output).toBe("restored");
    expect(JSON.parse((await onServer(`curl -s http://127.0.0.1:${port}/`)).output)).toMatchObject({ release });
    expect((await onServer(`readlink ${folder}/current ${folder}/${state.active}; stat -c '%U %a' ${folder}/state.json`)).output).toBe(
      `releases/${release}\nreleases/${release}\ndeploy 600\n`,
    );
    expect((await onServer("test -d /run/nuxvel-restore")).exitCode).not.toBe(0);

    const checked = await journal.drCheck("production");
    expect(checked.exitCode, checked.output).toBe(0);
    expect(checked.output).toContain(`✔ The recovery key decrypts the off-site config bundle ${stamp} of journal`);
    await onServer(
      "install -d -m 700 /srv/nuxvel/backups/journal && echo junk | age -R /etc/nuxvel/recovery.pub > /srv/nuxvel/backups/journal/config-29990101T000000Z.tar.age",
    );
    const corrupt = await journal.drCheck("production");
    expect(corrupt.exitCode).toBe(1);
    expect(corrupt.output).toContain("✖ The recovery key does not decrypt the local config bundle 29990101T000000Z of journal");
    expect(corrupt.output).toContain(`✔ The recovery key decrypts the off-site config bundle ${stamp} of journal`);
    const otherKey = (await onServer("age-keygen 2>/dev/null | grep '^AGE-SECRET-KEY-'")).output.trim();
    process.env.NUXVEL_RECOVERY_KEY = otherKey;
    const mismatch = await appWithFakeSsh({ ...journalOptions, backups: { offsite } }).drCheck("production");
    process.env.NUXVEL_RECOVERY_KEY = recoveryKey;
    expect(mismatch.exitCode).toBe(1);
    expect(mismatch.output).toMatch(/✖ This recovery key is not the one of 203\.0\.113\.10: its public key is age1/);
    await onServer("cp /etc/nuxvel/offsite.env /tmp/offsite.env && sed -i 's/^RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=.*/RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY=\"wrong\"/' /etc/nuxvel/offsite.env");
    const unreadable = await journal.drCheck("production");
    await onServer("mv /tmp/offsite.env /etc/nuxvel/offsite.env");
    expect(unreadable.exitCode).toBe(1);
    expect(unreadable.output).toContain("✖ Reading the off-site bucket failed:");
    expect((await onServer("test -d /run/nuxvel-dr-check")).exitCode).not.toBe(0);

    const again = await journal.serverRestore("production");
    expect(again.exitCode).toBe(1);
    expect(again.output).toContain("journal is live on this server, server:restore rebuilds a lost server");
    await onServer(
      `${asDeploy} pm2 delete '/^journal-/' > /dev/null && ${asDeploy} pm2 save > /dev/null && rm ${folder}/state.json && ` +
        `rm -rf /srv/nuxvel/assets/journal/_nuxt/* && ` +
        `runuser -u deploy -- rm -f ${folder}/state.json && ` +
        `printf '{}\\n' > /root/srv04b-sentinel && chmod 644 /root/srv04b-sentinel && ` +
        `runuser -u deploy -- ln -s /root/srv04b-sentinel ${folder}/state.json && ` +
        `runuser -u deploy -- ln -sf /root/srv04b-sentinel ${folder}/ecosystem.${state.active}.config.cjs`,
    );
    const rerun = await journal.serverRestore("production");
    expect(rerun.exitCode, rerun.output).toBe(0);
    expect((await onServer("stat -c '%U %a' /srv/nuxvel/assets/journal/_nuxt/entry.f00d.js")).output).toBe("root 644\n");
    expect((await onServer("stat -c '%U %a' /root/srv04b-sentinel && cat /root/srv04b-sentinel")).output).toBe("root 644\n{}\n");
    expect((await onServer(`stat -c '%U %a %F' ${folder}/state.json ${folder}/ecosystem.${state.active}.config.cjs`)).output).toBe(
      "deploy 600 regular file\ndeploy 600 regular file\n",
    );
    expect(rerun.output).toContain("~ drop the database journal: it is not live, and the backup restores into an empty database");
    expect((await onServer(`. ${folder}/shared/.env && psql "$NUXT_DATABASE_URL" -X -tA -c 'select count(*) from entries'`)).output).toBe("2\n");
    await onServer("cp /etc/nuxvel/recovery.pub /tmp/restore-recovery.pub && age-keygen 2>/dev/null | age-keygen -y > /etc/nuxvel/recovery.pub");
    const otherPub = await journal.serverRestore("production");
    await onServer("mv /tmp/restore-recovery.pub /etc/nuxvel/recovery.pub");
    expect(otherPub.exitCode).toBe(1);
    expect(otherPub.output).toMatch(/This server encrypts its backups to the recovery key age1\w+ in \/etc\/nuxvel\/recovery\.pub, not to age1/);
    process.env.NUXVEL_RECOVERY_KEY = "not-a-key";
    const wrongKey = await appWithFakeSsh({ ...journalOptions, backups: { offsite } }).serverRestore("production");
    expect(wrongKey.exitCode).toBe(1);
    expect(wrongKey.output).toContain("The recovery key is not an age secret key");
  }, 300000);

  it("refuses a config bundle with a link, or with an app name, registry entry, color or release that nuxvel does not make", async () => {
    const keys = (await onServer(". /etc/nuxvel/seaweedfs.env && echo $AWS_ACCESS_KEY_ID $AWS_SECRET_ACCESS_KEY")).output.trim().split(" ");
    const offsite = { endpoint: "http://127.0.0.1:8333", bucket: "forged-backups", accessKeyId: keys[0] ?? "", secretAccessKey: keys[1] ?? "" };
    await onServer("cp /etc/nuxvel/recovery.pub /tmp/recovery.pub && age-keygen -o /tmp/forged-recovery.key 2>/dev/null && age-keygen -y /tmp/forged-recovery.key > /etc/nuxvel/recovery.pub");
    clearEnvAfterTest("NUXVEL_RECOVERY_KEY");
    process.env.NUXVEL_RECOVERY_KEY = (await onServer("grep '^AGE-SECRET-KEY-' /tmp/forged-recovery.key")).output.trim();
    const journal = appWithFakeSsh({ ...journalOptions, backups: { offsite } });
    onTestFinished(async () => {
      await onServer("mv /tmp/recovery.pub /etc/nuxvel/recovery.pub && rm -rf /tmp/forged-recovery.key /tmp/forged /etc/nuxvel/offsite.env /etc/nuxvel/offsite-versions-tried");
      await appWithFakeSsh(journalOptions)("production");
    });
    expect((await journal("production")).exitCode).toBe(0);
    const pwn = { folder: "/srv/apps/pwn", database: { name: "pwn" }, domains: ["pwn.example.com"], redirects: {}, filesDomain: null, ports: { blue: [9000, 9009], green: [9010, 9019] } };
    const serverJson = (entry: object) => JSON.stringify({ apps: { pwn: { ...pwn, ...entry } } });
    const nothingCreated = async () => {
      expect((await onServer("test -e /srv/apps/pwn || test -e /srv/nuxvel-srv09 || test -e /tmp/srv09-pwned || test -e /pwned")).exitCode).not.toBe(0);
      expect(JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output).apps.pwn).toBeUndefined();
    };

    await uploadBundle("forged-backups", "pwn;touch pwned", { "server.json": JSON.stringify({ apps: { "pwn;touch pwned": { ...pwn, folder: "/srv/apps/pwn;touch pwned" } } }) });
    const name = await journal.serverRestore("production");
    expect(name.exitCode).toBe(1);
    expect(name.output).toContain("The off-site bucket forged-backups holds no backup");
    await nothingCreated();

    await uploadBundle("forged-backups", "pwn", { "server.json": serverJson({ folder: "/srv/nuxvel-srv09", filesDomain: "f.com;touch /tmp/srv09-pwned" }) });
    const entry = await journal.serverRestore("production");
    expect(entry.exitCode).toBe(1);
    expect(entry.output).toContain("The registry entry of pwn in the config bundle 29990101T000000Z has values that nuxvel does not make: folder, filesDomain");
    await nothingCreated();

    await uploadBundle("forged-backups", "pwn", {
      "server.json": serverJson({}),
      "state.json": JSON.stringify({ active: "blue", releases: { blue: "../../../../etc", green: null } }),
    });
    const release = await journal.serverRestore("production");
    expect(release.exitCode).toBe(1);
    expect(release.output).toContain('names the active release "../../../../etc", which is not a release name');
    await nothingCreated();

    await uploadBundle("forged-backups", "pwn", { "server.json": serverJson({}) }, { "shared/.env": "/etc/nuxvel/offsite.env" });
    const link = await journal.serverRestore("production");
    expect(link.exitCode).toBe(1);
    expect(link.output).toContain("the config bundle holds a link or a special file");
    await nothingCreated();
  }, 420000);

  it("rehearses the restore of production next to the app on staging, times each step, and removes the copy after", async () => {
    const folder = "/srv/apps/journal";
    const keys = (await onServer(". /etc/nuxvel/seaweedfs.env && echo $AWS_ACCESS_KEY_ID $AWS_SECRET_ACCESS_KEY")).output.trim().split(" ");
    const offsite = { endpoint: "http://127.0.0.1:8333", bucket: "rehearsal-backups", accessKeyId: keys[0] ?? "", secretAccessKey: keys[1] ?? "" };
    await onServer("cp /etc/nuxvel/recovery.pub /tmp/recovery.pub && age-keygen -o /tmp/rehearsal-recovery.key 2>/dev/null && age-keygen -y /tmp/rehearsal-recovery.key > /etc/nuxvel/recovery.pub");
    clearEnvAfterTest("NUXVEL_RECOVERY_KEY");
    process.env.NUXVEL_RECOVERY_KEY = (await onServer("grep '^AGE-SECRET-KEY-' /tmp/rehearsal-recovery.key")).output.trim();
    const journal = appWithFakeSsh({ ...journalOptions, backups: { offsite } });
    onTestFinished(async () => {
      await onServer("mv /tmp/recovery.pub /etc/nuxvel/recovery.pub && rm -rf /tmp/rehearsal-recovery.key /srv/nuxvel/backups/journal /etc/nuxvel/offsite.env /etc/nuxvel/offsite-versions-tried");
      await appWithFakeSsh(journalOptions)("production");
    });

    expect((await journal("production")).exitCode).toBe(0);
    await onServer(`. ${folder}/shared/owner.env && psql "$NUXT_DATABASE_OWNER_URL" -X -q -c "truncate entries; insert into entries default values"`);
    const backedUp = await journal.backup("production");
    expect(backedUp.exitCode, backedUp.output).toBe(0);
    const stamp = /as of (\d{8}T\d{6}Z)/.exec(backedUp.output)?.[1];
    expect((await onServer("cd / && runuser -u deploy -- sudo -n /usr/local/lib/nuxvel/erasure journal u_erased_before_rehearsal")).exitCode).toBe(0);
    const environment = { servers: [server], arch: hostArch, domains: ["journal.example.com"], processes: { web: 2, worker: 1 }, deploy: { hold: 0 } };
    writeFileSync(
      join(journal.dir, "nuxvel.deploy.ts"),
      `import { defineDeploy } from "@nuxvel/cli/deploy";

export default defineDeploy({
  app: "journal",
  environments: {
    production: ${JSON.stringify({ ...environment, backups: { offsite } })},
    staging: ${JSON.stringify({ ...environment, servers: [{ ...server, host: "203.0.113.20" }], domains: ["staging.journal.example.com"] })},
  },
});
`,
    );
    const registry = async () => JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output);
    const port = (await registry()).apps.journal.ports[JSON.parse((await onServer(`cat ${folder}/state.json`)).output).active][0];
    const recoveryKey = (await onServer("cat /etc/nuxvel/recovery.pub")).output;

    await onServer("rm -f /tmp/leaked-env.log");
    const rehearsed = await journal.serverRestore("staging", "--from=production:latest");
    expect(rehearsed.exitCode, rehearsed.output).toBe(0);
    for (const step of [
      `~ download and decrypt the config bundle ${stamp} of journal (`,
      `Rehearsing the restore of journal from its backup ${stamp} of production, as journal-rehearsal next to journal`,
      `~ restore the database journal_rehearsal from the backup ${stamp} of journal (`,
      "~ restore the files of the bucket journal-private into journal-rehearsal-private (",
      "~ write /srv/apps/journal-rehearsal/shared/.env: the settings of journal with the connections of journal-rehearsal, and outgoing mail to a closed port",
      "~ erase again 1 user erased after the backup (",
      "without workers, so no job, mail, webhook or schedule runs, and wait until it is ready (",
      "~ drop the database journal_rehearsal",
      "~ remove journal-rehearsal from the server registry",
    ]) {
      expect(rehearsed.output).toContain(step);
    }
    expect(rehearsed.output).not.toContain("make the final backup");
    expect(rehearsed.output).toMatch(/✔ Rehearsed the restore of journal from production on 203\.0\.113\.20 in \d+(\.\d)? min, and removed journal-rehearsal/);
    expect((await onServer("cat /tmp/leaked-env.log 2>/dev/null || true")).output).toBe("");

    expect(rehearsed.output).toContain("Recorded in .nuxvel/rehearsals.json: commit it, nuxvel doctor warns when the last rehearsal of production is older than 90 days");
    const recorded = JSON.parse(readFileSync(join(journal.dir, ".nuxvel", "rehearsals.json"), "utf8"));
    expect(recorded.production).toMatchObject({ on: "staging", backup: stamp, minutes: expect.any(Number) });
    expect(recorded.production.steps.map((step: { what: string }) => step.what)).toEqual(
      expect.arrayContaining([`download and decrypt the config bundle ${stamp} of journal`, `restore the database journal_rehearsal from the backup ${stamp} of journal`]),
    );
    expect((await registry()).apps["journal-rehearsal"]).toBeUndefined();
    expect((await onServer("test -e /srv/apps/journal-rehearsal || test -e /run/nuxvel-rehearsal || test -e /srv/nuxvel/backups/journal-rehearsal")).exitCode).not.toBe(0);
    expect((await onServer("cd / && runuser -u postgres -- psql -X -tA -c \"select count(*) from pg_database where datname = 'journal_rehearsal'\"")).output).toBe("0\n");
    expect((await onServer(`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${port}/api/health/ready`)).output).toBe("200");
    expect((await onServer("cat /etc/nuxvel/recovery.pub")).output).toBe(recoveryKey);

    const unknown = await journal.serverRestore("staging", "--from=nowhere:latest");
    expect(unknown.exitCode).not.toBe(0);
    expect(unknown.output).toContain("nowhere");
    await uploadBundle("rehearsal-backups", "journal", { "state.json": JSON.stringify({ active: "blue", releases: { blue: "../../../../etc", green: null } }) });
    const forgedRelease = await journal.serverRestore("staging", "--from=production:latest");
    expect(forgedRelease.exitCode).toBe(1);
    expect(forgedRelease.output).toContain('names the active release "../../../../etc", which is not a release name');
    await uploadBundle("rehearsal-backups", "journal", {}, { "shared/.env": "/etc/nuxvel/offsite.env" });
    const forgedLink = await journal.serverRestore("staging", "--from=production:latest");
    expect(forgedLink.exitCode).toBe(1);
    expect(forgedLink.output).toContain("the config bundle holds a link or a special file");
    expect((await onServer("test -e /srv/apps/journal-rehearsal")).exitCode).not.toBe(0);

    await onServer("mv /usr/bin/rclone /usr/bin/rclone.hidden");
    const withoutRclone = await journal.serverRestore("staging", "--from=production:latest").finally(() => onServer("mv /usr/bin/rclone.hidden /usr/bin/rclone"));
    expect(withoutRclone.exitCode).toBe(1);
    expect(withoutRclone.output).toContain("rclone is not installed on this server: set backups.offsite for staging and run nuxvel server:setup staging");
  }, 300000);

  it("rotates the database, Redis and S3 credentials with a deploy in between, after which the old ones do not connect", async () => {
    const shared = "/srv/apps/journal/shared";
    const journal = appWithFakeSsh(journalOptions);
    const value = (env: string, key: string) => new RegExp(`^${key}=(.*)$`, "m").exec(env)?.[1] ?? "";
    const envs = async () => ({ env: (await onServer(`cat ${shared}/.env`)).output, owner: (await onServer(`cat ${shared}/owner.env`)).output });
    const psql = async (url: string, query: string) => onServer(`psql "${url}" -X -q -tA -c "${query}" 2>&1`);
    const redisPing = async (url: string) => (await onServer(`redis-cli --no-auth-warning -u "${url}" ping 2>&1`)).output.trim();
    const bucket = async (url: string) => {
      const credentials = url.replace(/^http:\/\//, "").replace(/@.*$/, "");
      return (await onServer(`curl -s -o /dev/null -w '%{http_code}' --aws-sigv4 aws:amz:us-east-1:s3 --user '${credentials}' http://127.0.0.1:8333/journal-private`)).output;
    };
    const before = await envs();

    const add = Buffer.from(rotateScript("add", { deployUser: "deploy", app: "journal" })).toString("base64");
    // The new login role is named with the time in seconds, so each run waits for the next second
    const nextSecond = `s=$(date +%s); while [ "$(date +%s)" = "$s" ]; do :; done`;
    for (const attempt of ["failed", "again"]) {
      const added = await onServer(`echo ${add} | base64 -d | bash >/dev/null && ${nextSecond}`);
      expect(added.exitCode, `${attempt}: ${added.output}`).toBe(0);
    }
    for (const key of ["NUXT_REDIS_URL", "NUXT_REDIS_CACHE_URL"]) expect(await redisPing(value(before.env, key))).toBe("PONG");

    await onServer(
      `printf 'root only\\n' > /root/srv04-sentinel && chmod 600 /root/srv04-sentinel && ` +
        `runuser -u deploy -- ln -s /root/srv04-sentinel ${shared}/.env.nuxvel-new && ` +
        `runuser -u deploy -- ln -s /root/srv04-sentinel ${shared}/owner.env.nuxvel-new`,
    );
    const rotated = await journal.rotate("production");
    expect(rotated.exitCode, rotated.output).toBe(0);
    expect((await onServer("stat -c '%U %a' /root/srv04-sentinel && cat /root/srv04-sentinel")).output).toBe("root 600\nroot only\n");
    expect((await onServer(`stat -c '%U %a %F' ${shared}/.env ${shared}/owner.env`)).output).toBe(
      "deploy 600 regular file\ndeploy 600 regular file\n",
    );
    for (const line of [
      "~ give the database role journal_owner a new password",
      "~ add a second password to the Redis user journal on durable",
      "~ add a second S3 key to the S3 user journal",
      "Deploying ",
      "~ turn off the login of the database role journal_app",
      "~ remove the old password of the Redis user journal on cache",
      "~ delete the old S3 key",
      "✔ Rotated the database, Redis and S3 credentials of journal on 203.0.113.10",
    ]) {
      expect(rotated.output).toContain(line);
    }
    expect(rotated.output).toMatch(/Deployed the release \S+ of journal/);
    const after = await envs();
    for (const key of ["NUXT_DATABASE_URL", "NUXT_REDIS_URL", "NUXT_REDIS_CACHE_URL", "NUXT_STORAGE_URL"]) {
      expect(value(after.env, key)).not.toBe(value(before.env, key));
    }
    expect(value(after.env, "NUXT_DATABASE_URL")).toMatch(/^postgres:\/\/journal_app_\d{14}:/);

    expect((await psql(value(before.env, "NUXT_DATABASE_URL"), "select 1")).exitCode).not.toBe(0);
    expect((await psql(value(before.owner, "NUXT_DATABASE_OWNER_URL"), "select 1")).exitCode).not.toBe(0);
    expect((await psql(value(after.env, "NUXT_DATABASE_URL"), "insert into entries default values returning 1")).output).toBe("1\n");
    expect((await psql(value(after.owner, "NUXT_DATABASE_OWNER_URL"), "select 1")).output).toBe("1\n");
    for (const key of ["NUXT_REDIS_URL", "NUXT_REDIS_CACHE_URL"]) {
      expect(await redisPing(value(before.env, key))).toContain("WRONGPASS");
      expect(await redisPing(value(after.env, key))).toBe("PONG");
    }
    expect(await bucket(value(before.env, "NUXT_STORAGE_URL"))).toBe("403");
    expect(await bucket(value(after.env, "NUXT_STORAGE_URL"))).toBe("200");

    const again = await journal.rotate("production");
    expect(again.exitCode, again.output).toBe(0);
    const login = /^postgres:\/\/(journal_app_\d{14}):/.exec(value(after.env, "NUXT_DATABASE_URL"))?.[1];
    expect(again.output).toContain(`~ drop the database role ${login}`);
    expect((await psql(value(after.env, "NUXT_DATABASE_URL"), "select 1")).exitCode).not.toBe(0);
  }, 240000);

  it("stops the revoke of rotated credentials, and revokes nothing, when it cannot read the S3 keys or the live S3 key is missing", async () => {
    const journal = appWithFakeSsh(journalOptions);
    const failingList = Buffer.from(
      '#!/bin/sh\ninput=$(cat)\ncase $input in *s3.accesskey.list*) exit 1 ;; esac\nprintf \'%s\\n\' "$input" | exec /usr/local/bin/weed.real "$@"\n',
    ).toString("base64");
    await onServer(`mv /usr/local/bin/weed /usr/local/bin/weed.real && echo ${failingList} | base64 -d > /usr/local/bin/weed && chmod 755 /usr/local/bin/weed`);
    onTestFinished(async () => {
      await onServer("mv -f /usr/local/bin/weed.real /usr/local/bin/weed; rm -rf /tmp/srv12");
    });

    const rotated = await journal.rotate("production");
    expect(rotated.exitCode, rotated.output).not.toBe(0);
    expect(rotated.output).toContain("Revoking the old credentials failed");
    expect(rotated.output).not.toContain("~ drop the database role");
    expect(rotated.output).not.toContain("Rotated the database");
    await onServer("mv -f /usr/local/bin/weed.real /usr/local/bin/weed");

    const revoke = Buffer.from(
      rotateScript("revoke", { deployUser: "deploy", app: "journal" }).replace("NUXVEL_APP_DIR=/srv/apps/journal", "NUXVEL_APP_DIR=/tmp/srv12"),
    ).toString("base64");
    const missingKey = await onServer(
      `rm -rf /tmp/srv12 && mkdir /tmp/srv12 && cp -a /srv/apps/journal/shared /tmp/srv12/ && ` +
        `sed -i '/^NUXT_STORAGE_URL=/d' /tmp/srv12/shared/.env && echo ${revoke} | base64 -d | bash`,
    );
    expect(missingKey.exitCode, missingKey.output).not.toBe(0);
    expect(missingKey.output).toContain("NUXT_STORAGE_URL in /tmp/srv12/shared/.env names no S3 key of the S3 user journal. Nothing is revoked.");
    expect(missingKey.output).not.toContain("~ drop the database role");
  }, 240000);

  type FakeBuild = { node: string; commit?: string; arch?: string; failingMigration?: boolean; status?: number; contract?: string[] };

  function fakeBuildOutput(root: string, manifest: FakeBuild) {
    mkdirSync(join(root, ".output", "server", "nuxvel", "migrations", "contract"), { recursive: true });
    mkdirSync(join(root, ".output", "public", "_nuxt"), { recursive: true });
    for (const tag of manifest.contract ?? []) {
      const backfill = tag.endsWith("-backfill") ? "-- nuxvel:requires-backfill=fill-entries\n" : "";
      writeFileSync(join(root, ".output", "server", "nuxvel", "migrations", "contract", `${tag}.sql`), `${backfill}ALTER TABLE entries DROP COLUMN old;\n`);
    }
    writeFileSync(
      join(root, ".output", "server", "index.mjs"),
      `import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename } from "node:path";
process.on("SIGUSR2", () => appendFileSync("/tmp/drained.log", \`\${basename(process.cwd())}\\n\`));
if (Object.keys(process.env).some((name) => name.startsWith("RCLONE_CONFIG_"))) appendFileSync("/tmp/leaked-env.log", \`\${basename(process.cwd())}\\n\`);
createServer((req, res) => {
  if (req.url === "/api/health/ready") return res.end("ok");
  res.statusCode = ${manifest.status ?? 200};
  res.end(JSON.stringify({ release: basename(process.cwd()), role: process.env.NUXVEL_ROLE ?? "web", pool: process.env.NUXT_DATABASE_POOL_MAX }));
}).listen(Number(process.env.PORT), process.env.HOST, () => process.send?.("ready"));
`,
    );
    writeFileSync(
      join(root, ".output", "server", "nuxvel", "migrate.mjs"),
      manifest.failingMigration
        ? 'console.error("nuxvel migrate: could not apply the migrations");\nprocess.exitCode = 1;\n'
        : `import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
const psql = (command) => execFileSync("psql", [process.env.NUXT_DATABASE_OWNER_URL, "-X", "-qAt", "-c", command]).toString();
const own = readdirSync(new URL("./migrations/contract/", import.meta.url)).map((file) => file.replace(/\\.sql$/, ""));
const allowed = (process.env.NUXVEL_CONTRACT_MIGRATIONS ?? "").split(",");
const done = psql("create table if not exists fake_contract (tag text primary key); select tag from fake_contract").split("\\n");
const waiting = own.filter((tag) => tag.endsWith("-backfill"));
const contract = own.filter((tag) => allowed.includes(tag) && !done.includes(tag) && !waiting.includes(tag));
for (const tag of contract) psql(\`insert into fake_contract values ('\${tag}')\`);
const deferred = own.filter((tag) => !contract.includes(tag) && !done.includes(tag));
writeFileSync(process.env.NUXVEL_MIGRATE_RESULT, JSON.stringify({ applied: [], contract, deferred }));
execFileSync("psql", [process.env.NUXT_DATABASE_OWNER_URL, "-X", "-q", "-c", "create table if not exists entries (id serial primary key)"]);
execFileSync("psql", [process.env.NUXT_DATABASE_OWNER_URL, "-X", "-q", "-c", "create schema if not exists drizzle; create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint); insert into drizzle.__drizzle_migrations (hash, created_at) select 'entries', 1 where not exists (select 1 from drizzle.__drizzle_migrations)"]);
console.log("nuxvel migrate: the database is up to date");
`,
    );
    writeFileSync(
      join(root, ".output", "server", "nuxvel", "tinker.mjs"),
      `import { existsSync, rmSync, writeFileSync } from "node:fs";
if (process.argv[2]) {
  const command = JSON.parse(process.argv[2]);
  const state = "/tmp/fake-maintenance.json";
  console.log(\`command \${command.kind} in \${process.cwd()} (\${process.env.NODE_ENV}) with \${process.argv[2]}\`);
  if (command.kind === "down") writeFileSync(state, JSON.stringify(command));
  if (command.kind === "up") rmSync(state, { force: true });
  if (command.kind === "maintenance:status") {
    writeFileSync(command.outFile, JSON.stringify(existsSync(state) ? { down: true, message: "Back at noon", retryAfter: 60, since: "2026-10-03T10:00:00.000Z", allow: [], bypass: false, queuePaused: true } : { down: false, queuePaused: false }));
  }
  process.exit(0);
}
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", async () => {
  console.log(\`tinker in \${process.cwd()} (\${process.env.NODE_ENV}) read \${JSON.stringify(input.trim())}, database \${process.env.NUXT_DATABASE_URL ? "set" : "unset"}, owner \${process.env.NUXT_DATABASE_OWNER_URL ? "set" : "unset"}, erasure log \${process.env.NUXT_ERASURE_LOG_COMMAND}, trust proxy \${process.env.NUXT_NUXVEL_SECURITY_TRUST_PROXY}\`);
  const { execFileSync } = await import("node:child_process");
  for (const [, id] of input.matchAll(/eraseUserData\\("([^"]+)"\\)/g)) {
    execFileSync("psql", [process.env.NUXT_DATABASE_URL, "-X", "-q", "-c", \`create table if not exists erased_again (id text, log text); insert into erased_again values ('\${id}', '\${process.env.NUXT_ERASURE_LOG_COMMAND}')\`]);
    console.log(\`@erased \${id}\`);
  }
});
`,
    );
    writeFileSync(join(root, ".output", "public", "_nuxt", "entry.f00d.js"), "console.log('entry');\n");
    writeFileSync(
      join(root, "nuxvel-manifest.json"),
      JSON.stringify({
        app: "journal",
        version: null,
        commit: manifest.commit ?? null,
        source: "ci",
        builtAt: "2026-09-27T10:00:00.000Z",
        node: manifest.node,
        platform: "linux",
        arch: manifest.arch ?? process.arch,
        libc: "glibc",
        nuxt: null,
        nuxvel: null,
        migrations: 0,
      }),
    );
  }

  async function fakeArtifact(dir: string, manifest: FakeBuild) {
    const root = join(
      dir,
      `artifact-${manifest.node}-${manifest.arch ?? process.arch}-${manifest.failingMigration ?? false}-${manifest.status ?? 200}-${(manifest.contract ?? []).join("+")}`,
    );
    const file = `${root}.tar.gz`;

    fakeBuildOutput(root, manifest);
    await createTar({ gzip: true, file, cwd: root }, ["."]);
    writeFileSync(`${file}.sha256`, `${createHash("sha256").update(readFileSync(file)).digest("hex")}  ${basename(file)}\n`);

    return file;
  }

  it("builds the archive for the server with Docker Buildx when no --artifact is given, from a clean and pushed git tree", async () => {
    const journal = appWithFakeSsh(journalOptions);
    const node = (await onServer("node -p process.versions.node")).output.trim();
    const realDocker = (await run("sh", ["-c", "command -v docker"], process.cwd())).stdout.trim();
    const git = async (...args: string[]) => {
      const result = await run("git", ["-c", "user.name=Dev", "-c", "user.email=dev@example.com", ...args], journal.dir);
      expect(result.exitCode, result.output).toBe(0);
      return result.stdout.trim();
    };

    fakeBuildOutput(join(journal.dir, "..", `${basename(journal.dir)}-build`), { node, commit: "unknown-commit" });
    onTestFinished(() => rmSync(join(journal.dir, "..", `${basename(journal.dir)}-build`), { recursive: true, force: true }));
    writeFileSync(
      join(journal.dir, "bin", "docker"),
      `#!/bin/sh
[ "$1" = buildx ] || exec ${realDocker} "$@"
echo "$*" >> ${journal.dir}/../${basename(journal.dir)}-buildx.log
for arg; do
  case "$arg" in
    type=local,dest=*) dest=\${arg#type=local,dest=} ;;
    NUXVEL_GIT_COMMIT=*) commit=\${arg#NUXVEL_GIT_COMMIT=} ;;
  esac
done
cp -R ${journal.dir}/../${basename(journal.dir)}-build/. "$dest/"
sed "s/unknown-commit/$commit/" "$dest/nuxvel-manifest.json" > "$dest/manifest.tmp" && mv "$dest/manifest.tmp" "$dest/nuxvel-manifest.json"
`,
    );
    chmodSync(join(journal.dir, "bin", "docker"), 0o755);
    onTestFinished(() => rmSync(join(journal.dir, "..", `${basename(journal.dir)}-buildx.log`), { force: true }));
    writeFileSync(join(journal.dir, "package.json"), JSON.stringify({ name: "journal", version: "1.0.0" }));
    writeFileSync(join(journal.dir, "Dockerfile"), "FROM scratch\n");
    writeFileSync(join(journal.dir, ".gitignore"), "dist/\n");
    const remote = `${journal.dir}-remote.git`;
    onTestFinished(() => rmSync(remote, { recursive: true, force: true }));
    await git("init", "-q", "-b", "main");
    await git("add", "-A");
    await git("commit", "-q", "-m", "journal");
    const commit = await git("rev-parse", "--short=7", "HEAD");

    const unpushed = await journal.deploy("production");
    expect(unpushed.exitCode).toBe(1);
    expect(unpushed.output).toContain(`✖ The git tree has the commit ${commit}, which is not pushed`);
    expect(unpushed.output).toContain("→ Commit and push it, or deploy it anyway with --force");

    await git("init", "-q", "--bare", remote);
    await git("remote", "add", "origin", remote);
    await git("push", "-q", "origin", "main");
    writeFileSync(join(journal.dir, "notes.txt"), "draft\n");
    const dirty = await journal.deploy("production");
    expect(dirty.exitCode).toBe(1);
    expect(dirty.output).toContain("✖ The git tree has uncommitted changes");
    rmSync(join(journal.dir, "notes.txt"));

    const built = await journal.deploy("production");
    expect(built.exitCode, built.output).toBe(0);
    expect(built.output).toContain(`Built linux/${hostArch}`);
    expect(built.output).toMatch(new RegExp(`Deployed the release \\d{8}T\\d{6}Z-${commit} of journal`));
    expect(readFileSync(join(journal.dir, "..", `${basename(journal.dir)}-buildx.log`), "utf8")).toContain(
      `buildx build --platform linux/${hostArch} --target artifact`,
    );

    writeFileSync(join(journal.dir, "notes.txt"), "draft\n");
    const forced = await journal.deploy("production", "--force");
    expect(forced.exitCode, forced.output).toBe(0);
  }, 120000);

  it("destroys an app after its name is typed, keeping a final backup encrypted to the recovery key", async () => {
    const doomed = appWithFakeSsh({ app: "doomed" });
    expect((await doomed.createApp("production")).exitCode).toBe(0);
    const shared = "/srv/apps/doomed/shared";
    const s3 = "http://127.0.0.1:8333";
    const credentials = `"$(sed -n 's|^NUXT_STORAGE_URL=http://\\(.*\\)@.*|\\1|p' ${shared}/.env)"`;
    const seeded = await onServer(
      `. ${shared}/owner.env && psql "$NUXT_DATABASE_OWNER_URL" -X -q -c "create table note (title text); insert into note values ('Keep me')" && ` +
        `curl -fsS --aws-sigv4 aws:amz:us-east-1:s3 --user ${credentials} -X PUT --data-binary upload ${s3}/doomed-private/tmp/upload.txt && ` +
        `${loadDotDotEntry("/buckets/doomed-private/tmp")} && ` +
        `curl -fsS --aws-sigv4 aws:amz:us-east-1:s3 --user ${credentials} -X PUT --data-binary logo ${s3}/doomed-public/logo.txt && ` +
        `curl -fsS --aws-sigv4 aws:amz:us-east-1:s3 --user ${credentials} -X PUT --data-binary hash ${s3}/doomed-public/a%23b%3F.txt && ` +
        `. ${shared}/.env && redis-cli --no-auth-warning -u "$NUXT_REDIS_URL" set doomed:nuxvel:cache:posts 1 && ` +
        `redis-cli --no-auth-warning -u "$NUXT_REDIS_URL" set "doomed:it's a key" 1 && ` +
        "install -d -m 700 /srv/nuxvel/backups/doomed/buckets/doomed-private && touch /srv/nuxvel/backups/doomed/database-20260101T020000Z.dump && " +
        "install -d -m 755 /srv/nuxvel/backup-status && touch /srv/nuxvel/backup-status/doomed.json /srv/nuxvel/backup-status/doomed.drill.json && " +
        "runuser -u deploy -- sudo -n /usr/local/lib/nuxvel/caddy-site doomed blue && " +
        "cd / && runuser -u deploy -- env HOME=/home/deploy pm2 start sleep --name doomed-web-blue -- 600",
    );
    expect(seeded.exitCode, seeded.output).toBe(0);
    await onServer("cp /etc/nuxvel/recovery.pub /tmp/recovery.pub && age-keygen -o /tmp/test-recovery.key 2>/dev/null && age-keygen -y /tmp/test-recovery.key > /etc/nuxvel/recovery.pub");
    onTestFinished(async () => {
      await onServer("mv /tmp/recovery.pub /etc/nuxvel/recovery.pub && rm -rf /tmp/test-recovery.key /tmp/final");
    });

    const withoutTty = await doomed.destroyApp.withoutTty();
    expect(withoutTty.exitCode).toBe(1);
    expect(withoutTty.output).toContain("app:destroy needs the app name typed in a terminal");
    const wrongName = await doomed.destroyApp([["Type doomed to destroy it and its data on root@203.0.113.10", "tasks"]]);
    expect(wrongName.exitCode).toBe(1);
    expect(wrongName.output).toContain("Cancelled: doomed on root@203.0.113.10 is unchanged");
    expect((await onServer("ls /srv/apps/doomed")).exitCode).toBe(0);

    const destroyed = await doomed.destroyApp([["Type doomed to destroy it and its data", "doomed"]]);
    expect(destroyed.exitCode, destroyed.output).toBe(0);
    expect((await onServer("cd / && runuser -u deploy -- env HOME=/home/deploy pm2 jlist")).output).not.toContain("doomed-");
    for (const change of [
      "~ delete the pm2 processes of doomed",
      "~ remove the Caddy site /etc/caddy/sites/doomed.caddy",
      "~ remove the timer nuxvel-doomed-maintenance",
      "~ drop the database doomed",
      "~ drop the database role doomed_app",
      "~ drop the database role doomed_owner",
      "~ remove the Redis user doomed and the keys doomed:* from durable",
      "~ remove the Redis user doomed and the keys doomed:* from cache",
      "~ delete the bucket doomed-private and its files",
      "~ delete the bucket doomed-public and its files",
      "~ remove the S3 user doomed",
      "~ remove /srv/apps/doomed",
      "~ remove /srv/nuxvel/assets/doomed",
      "~ remove the backup and restore drill status of doomed",
      "~ remove the nightly backups of doomed from /srv/nuxvel/backups/doomed, except the final backups",
      "~ remove doomed from the server registry /srv/nuxvel/server.json",
    ]) {
      expect(destroyed.output).toContain(change);
    }
    expect(destroyed.output).toContain("✔ Removed doomed from root@203.0.113.10");
    const backup = /~ make the final backup (\/srv\/nuxvel\/backups\/doomed\/final-\d{8}T\d{6}Z\.tar\.age), encrypted to the recovery key/.exec(
      destroyed.output,
    )?.[1];
    expect(backup).toBeDefined();

    expect((await onServer("ls /srv/apps/doomed /etc/systemd/system/nuxvel-doomed-maintenance.timer")).exitCode).not.toBe(0);
    expect((await onServer("ls /srv/nuxvel/backup-status")).output).not.toContain("doomed");
    expect((await onServer("ls /etc/caddy/sites")).output).not.toContain("doomed");
    const { apps } = JSON.parse((await onServer("cat /srv/nuxvel/server.json")).output);
    expect(apps.doomed).toBeUndefined();
    expect(apps.tasks).toBeDefined();
    const sql = (query: string) => onServer(`cd / && runuser -u postgres -- psql -X -tA -c "${query}"`);
    expect((await sql("select count(*) from pg_database where datname = 'doomed'")).output).toBe("0\n");
    expect((await sql("select count(*) from pg_roles where rolname like 'doomed%'")).output).toBe("0\n");
    expect((await onServer("grep -c '^user doomed ' /etc/redis/durable.acl /etc/redis/cache.acl")).output).toBe(
      "/etc/redis/durable.acl:0\n/etc/redis/cache.acl:0\n",
    );
    const redisKeys = (port: number, name: string, pattern: string) =>
      onServer(`REDISCLI_AUTH=$(cat /etc/nuxvel/redis-${name}.password) redis-cli -p ${port} --user nuxvel --no-auth-warning --scan --pattern '${pattern}' | wc -l`);
    expect((await redisKeys(6379, "durable", "doomed:*")).output).toBe("0\n");
    expect((await redisKeys(6379, "durable", "tasks:*")).output).not.toBe("0\n");
    const s3Status = await onServer(
      "set -a && . /etc/nuxvel/seaweedfs.env && " +
        `curl -s -o /dev/null -w '%{http_code}' -I --aws-sigv4 aws:amz:us-east-1:s3 --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" ${s3}/doomed-private`,
    );
    expect(s3Status.output).toBe("404");
    expect((await onServer("echo s3.user.list | weed shell -master=127.0.0.1:9333")).output).not.toContain('"doomed"');

    expect((await onServer(`stat -c '%U %a' /srv/nuxvel/backups/doomed ${backup}`)).output).toBe("root 700\nroot 600\n");
    expect((await onServer("ls -A /srv/nuxvel/backups/doomed")).output).toBe(`${backup?.split("/").pop()}\n`);
    const restored = await onServer(
      `mkdir /tmp/final && age -d -i /tmp/test-recovery.key ${backup} | tar -x -C /tmp/final && cd /tmp/final && ` +
        "cat buckets/doomed-private/tmp/upload.txt buckets/doomed-public/logo.txt 'buckets/doomed-public/a#b?.txt' && echo && ls -A shared && " +
        "grep -c '^NUXT_DATABASE_URL=' shared/.env && grep -c '^NUXT_DATABASE_OWNER_URL=' shared/owner.env && " +
        "node -p 'require(\"./app.json\").database.name' && pg_restore -f - database.dump | grep -x 'Keep me'",
    );
    expect(restored.output).toBe("uploadlogohash\n.env\nowner.env\n1\n1\ndoomed\nKeep me\n");

    const again = await doomed.destroyApp([["Type doomed", "doomed"]]);
    expect(again.exitCode).toBe(1);
    expect(again.output).toContain("doomed is not on this server, /srv/nuxvel/server.json has no entry for it");
  }, 180000);

  it("pins the SSH host key under the configured host on the first setup, and refuses to connect when it changes", async () => {
    const setup = appWithFakeSsh({ label: "server setup" });
    const realSsh = (await run("sh", ["-c", "command -v ssh"], process.cwd())).stdout.trim();
    const clientKey = join(setup.dir, "client-key");

    expect((await run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", clientKey], setup.dir)).exitCode).toBe(0);
    await onServer(`cp /root/.ssh/authorized_keys /tmp/authorized_keys && echo '${readFileSync(`${clientKey}.pub`, "utf8").trim()}' >> /root/.ssh/authorized_keys`);
    onTestFinished(async () => {
      await onServer("mv /tmp/authorized_keys /root/.ssh/authorized_keys");
    });
    writeFileSync(
      join(setup.dir, "bin", "ssh"),
      `#!/bin/sh
exec ${realSsh} -F none -i "${clientKey}" -o IdentitiesOnly=yes -o BatchMode=yes -p 2222 -o "ProxyCommand=docker exec -i ${container} /usr/sbin/sshd -i" "$@"
`,
    );

    const serverKey = (await onServer("cut -d ' ' -f 1,2 /etc/ssh/ssh_host_ed25519_key.pub")).output.trim();
    const fingerprint = (await onServer("ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub")).output.split(" ")[1];

    const first = await setup("production", "--dry-run");
    expect(first.exitCode, first.output).toBe(0);
    expect(first.output).toContain(`SSH host key of 203.0.113.10: ssh-ed25519 ${fingerprint}`);
    expect(first.output).toContain("Pinned in .nuxvel/known_hosts");
    expect(readFileSync(join(setup.dir, ".nuxvel", "known_hosts"), "utf8")).toBe(`203.0.113.10 ${serverKey}\n`);

    const second = await setup("production", "--dry-run");
    expect(second.exitCode, second.output).toBe(0);
    expect(second.output).not.toContain("SSH host key of");

    await onServer("mkdir /tmp/host-keys && mv /etc/ssh/ssh_host_* /tmp/host-keys/ && ssh-keygen -A");
    const changed = await setup("production", "--dry-run");
    await onServer("rm /etc/ssh/ssh_host_* && mv /tmp/host-keys/* /etc/ssh/ && rmdir /tmp/host-keys");
    expect(changed.exitCode).toBe(1);
    expect(changed.output).toContain("The SSH host key of 203.0.113.10 is not the one pinned in .nuxvel/known_hosts");
    expect(changed.output).not.toContain("Memory budget");
    expect(readFileSync(join(setup.dir, ".nuxvel", "known_hosts"), "utf8")).toBe(`203.0.113.10 ${serverKey}\n`);
  }, 120000);

  it("refuses to connect when the project path has a character ssh expands in the known_hosts path", async () => {
    const setup = appWithFakeSsh({ label: "server%setup" });
    const result = await setup("production", "--dry-run");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('the path contains " \\ % or $');
    expect(result.output).not.toContain("ssh to");
  });

  it("adds root's missing SSH keys to the deploy user, and keeps the keys that only the deploy user has", async () => {
    const script = shellScriptOf([join(cliDir, "src", "server", "scripts", "40-deploy-user.sh")], "NUXVEL_DRY_RUN=0\nNUXVEL_DEPLOY_USER=keys-check");
    const runScript = () => onServer(`echo ${Buffer.from(script).toString("base64")} | base64 -d | bash 2>&1`);
    const rootKeys = (await onServer("cat /root/.ssh/authorized_keys")).output;
    onTestFinished(async () => {
      await onServer(`userdel -r keys-check; echo ${Buffer.from(rootKeys).toString("base64")} | base64 -d > /root/.ssh/authorized_keys`);
    });

    const first = await runScript();
    expect(first.exitCode, first.output).toBe(0);
    expect(first.output).toContain("~ add root's SSH keys to keys-check");
    await onServer("printf 'ssh-ed25519 AAAAci ci@github' >> /home/keys-check/.ssh/authorized_keys");
    await onServer("echo 'ssh-ed25519 AAAAlaptop laptop' >> /root/.ssh/authorized_keys");

    const second = await runScript();
    expect(second.exitCode, second.output).toBe(0);
    expect(second.output).toBe("~ add root's SSH keys to keys-check\n");
    expect((await onServer("cat /home/keys-check/.ssh/authorized_keys")).output).toBe(
      `${rootKeys}ssh-ed25519 AAAAci ci@github\nssh-ed25519 AAAAlaptop laptop\n`,
    );
    expect((await onServer("stat -c '%U %a' /home/keys-check/.ssh/authorized_keys")).output).toBe("keys-check 600\n");
    expect((await runScript()).output).toBe("");
  });

  it("refuses to install a Node.js major older than the one on the server", async () => {
    const script = (major: number) =>
      shellScriptOf(
        [join(cliDir, "src", "server", "scripts", "100-node.sh")],
        `NUXVEL_DRY_RUN=1\nNUXVEL_NODE_MAJOR=${major}\nPATH=/tmp/fake-node:$PATH`,
      );
    const runScript = (major: number) => onServer(`echo ${Buffer.from(script(major)).toString("base64")} | base64 -d | bash 2>&1`);
    await onServer("mkdir -p /tmp/fake-node && printf '#!/bin/sh\\necho v24.4.0\\n' > /tmp/fake-node/node && chmod +x /tmp/fake-node/node");
    onTestFinished(async () => {
      await onServer("rm -r /tmp/fake-node");
    });

    const older = await runScript(22);
    expect(older.exitCode).toBe(1);
    expect(older.output).toBe(
      "This server runs Node.js 24 and .nvmrc sets 22. nuxvel does not install an older Node.js major\n" +
        "Set .nvmrc to 24 or higher, or remove Node.js from the server yourself\n",
    );
    expect((await runScript(24)).output).toBe("");
    expect((await runScript(26)).output).toBe("~ install Node.js 26\n");
  });

  it("allows the SSH port of its connection in the firewall", async () => {
    const setup = appWithFakeSsh();
    const ssh = join(setup.dir, "bin", "ssh");
    writeFileSync(ssh, readFileSync(ssh, "utf8").replace("docker exec -i", "docker exec -e 'SSH_CONNECTION=198.51.100.7 50000 203.0.113.10 2200' -i"));

    const dryRun = await setup("production", "--dry-run");
    expect(dryRun.exitCode, dryRun.output).toBe(0);
    expect(dryRun.output).toContain("~ allow port 2200 in the firewall");
    expect(dryRun.output).not.toContain("~ allow port 22 in the firewall");
  }, 120000);

  it("refuses an unknown environment, a server that is not Ubuntu 26.04 or not of the arch in nuxvel.deploy.ts, and a root without an SSH key", async () => {
    const setup = appWithFakeSsh();

    const unknown = await setup("staging");
    expect(unknown.exitCode).toBe(2);
    expect(unknown.output).toContain('No environment "staging" in nuxvel.deploy.ts');
    expect(unknown.output).toContain("Pick one of: production");

    await onServer("sed -i s/26.04/24.04/ /etc/os-release");
    const oldUbuntu = await setup("production");
    await onServer("sed -i s/24.04/26.04/ /etc/os-release");
    expect(oldUbuntu.exitCode).toBe(1);
    expect(oldUbuntu.output).toContain("nuxvel sets up Ubuntu 26.04, this server runs Ubuntu 24.04");
    expect(oldUbuntu.output).toContain("The setup failed on root@203.0.113.10");

    const otherArch = hostArch === "arm64" ? "amd64" : "arm64";
    const wrongArch = await appWithFakeSsh({ arch: otherArch })("production", "--dry-run");
    expect(wrongArch.exitCode).toBe(1);
    expect(wrongArch.output).toContain(`nuxvel.deploy.ts sets arch to ${otherArch}, this server runs ${hostArch}`);

    rmSync(join(setup.dir, ".nvmrc"));
    const noNvmrc = await setup("production", "--dry-run");
    writeFileSync(join(setup.dir, ".nvmrc"), "v24.4.0\n");
    expect(noNvmrc.exitCode).toBe(1);
    expect(noNvmrc.output).toContain(".nvmrc with a Node.js version not found");

    const oneCpu = await appWithFakeSsh({ cpus: "0" })("production", "--dry-run");
    expect(oneCpu.exitCode, oneCpu.output).toBe(0);
    expect(oneCpu.output).toMatch(
      /▲ This server has 1 vCPU and \d+ MB of RAM, nuxvel recommends at least 2 vCPU and 4 GB of RAM/,
    );

    await onServer("mv /etc/nuxvel/recovery.pub /tmp/recovery.pub");
    const noTerminal = await setup("production");
    const recoveryFiles = (await onServer("ls /etc/nuxvel | grep recovery")).output;
    await onServer("rm /etc/nuxvel/recovery.pub.pending; mv /tmp/recovery.pub /etc/nuxvel/recovery.pub");
    expect(noTerminal.exitCode).toBe(1);
    expect(noTerminal.output).toContain("The new recovery key needs a confirmation in a terminal");
    expect(noTerminal.output).not.toContain("AGE-SECRET-KEY");
    expect(recoveryFiles).toBe("recovery.pub.pending\n");

    await onServer("mv /root/.ssh/authorized_keys /root/.ssh/keys");
    const noKey = await setup("production", "--dry-run");
    await onServer("mv /root/.ssh/keys /root/.ssh/authorized_keys");
    expect(noKey.exitCode).toBe(1);
    expect(noKey.output).toContain("root has no SSH key in /root/.ssh/authorized_keys");
  }, 120000);

  it("ships the pm2, Caddy and monitor logs with Vector when logs.sink is set, and keeps shipping after a setup without logs.sink", async () => {
    const sink = { type: "file", path: "/var/lib/vector/shipped.log", encoding: { codec: "json" } };
    const shipping = appWithFakeSsh({ logs: { sink } });

    const refused = await appWithFakeSsh({ logs: { sink: { type: "nope" } } })("production");
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain("Vector refused logs.sink of nuxvel.deploy.ts:");
    expect(refused.output).toContain("nope");
    expect((await onServer("test -f /etc/vector/vector.nuxvel-check.yaml")).exitCode).not.toBe(0);

    const setUp = await shipping("production");
    expect(setUp.exitCode, setUp.output).toBe(0);
    expect(setUp.output).toContain("~ ship the pm2, Caddy and monitor logs with Vector to a file sink");
    expect((await onServer("stat -c '%U:%G %a' /etc/vector/vector.yaml; id -nG vector")).output).toMatch(/^root:vector 640\n.*\bdeploy\b/);
    expect((await shipping("production")).output).toContain("is set up, nothing to change");

    await onServer(
      `runuser -u deploy -- sh -c 'mkdir -p /home/deploy/.pm2/logs && echo "{\\"msg\\":\\"shipped from pm2\\"}" >> /home/deploy/.pm2/logs/shipping-out-0.log'`,
    );
    await onServer(`echo '{"status":200,"uri":"/shipped-from-caddy"}' >> /var/log/caddy/shipping.access.log`);
    await onServer(`mkdir -p /var/log/nuxvel && echo '{"event":"disk","level":"warning"}' >> /var/log/nuxvel/monitor.log`);
    onTestFinished(async () => {
      await onServer(
        "pkill -x vector; rm -f /var/lib/vector/shipped.log /home/deploy/.pm2/logs/shipping-out-0.log /var/log/caddy/shipping.access.log /var/log/nuxvel/monitor.log",
      );
    });
    await onServer("setsid runuser -u vector -- vector --quiet --config /etc/vector/vector.yaml > /dev/null 2>&1 &");
    await expect
      .poll(async () => (await onServer("cat /var/lib/vector/shipped.log")).output, { timeout: 30000, interval: 500 })
      .toContain('"uri":"/shipped-from-caddy"');
    await expect.poll(async () => (await onServer("cat /var/lib/vector/shipped.log")).output, { timeout: 30000, interval: 500 }).toContain('"event":"disk"');
    const shipped = (await onServer("cat /var/lib/vector/shipped.log")).output;
    expect(shipped).toContain('"msg":"shipped from pm2"');
    expect(shipped).toContain('"event":"disk"');

    onTestFinished(async () => {
      await onServer("systemctl disable vector; rm -f /etc/vector/vector.yaml");
    });
    const other = await appWithFakeSsh()("production");
    expect(other.exitCode, other.output).toBe(0);
    expect(other.output).not.toContain("Vector");
    expect((await onServer("test -f /etc/vector/vector.yaml")).exitCode).toBe(0);
    expect((await onServer("systemctl is-enabled vector")).output).toBe("enabled\n");
  }, 300000);

  it("installs the waiting security updates, restarts the services that use an old library but not pm2, and reboots only with --reboot", async () => {
    const setup = appWithFakeSsh();

    const first = await setup.upgrade("production");
    expect(first.exitCode, first.output).toBe(0);
    const second = await setup.upgrade("production");
    expect(second.exitCode, second.output).toBe(0);
    expect(second.output).not.toContain("~ install the security updates");
    expect(second.output).toContain("✔ root@203.0.113.10 has no security update to install");

    await onServer(
      `printf '#!/bin/sh\\nif [ "$*" = "-s -q dist-upgrade" ]; then echo "Inst linux-image-generic [7.0.0-10.10] (7.0.0-12.12 Ubuntu:26.04/resolute-security [amd64])"; else exec /usr/bin/apt-get "$@"; fi\\n' > /usr/local/sbin/apt-get && chmod 755 /usr/local/sbin/apt-get`,
    );
    const kernel = await setup.upgrade("production");
    await onServer("rm /usr/local/sbin/apt-get");
    expect(kernel.exitCode, kernel.output).toBe(0);
    expect(kernel.output).toContain("~ install the security updates of linux-image-generic");

    await onServer(
      `printf '#!/bin/sh\\necho "NEEDRESTART-VER: 3.8"\\necho "NEEDRESTART-SVC: redis-server@cache.service"\\necho "NEEDRESTART-SVC: pm2-deploy.service"\\necho "NEEDRESTART-SVC: dbus.service"\\n' > /usr/local/sbin/needrestart && chmod 755 /usr/local/sbin/needrestart && : > /run/fake-systemctl`,
    );
    onTestFinished(async () => {
      await onServer("rm -f /usr/local/sbin/needrestart /var/run/reboot-required /var/run/reboot-required.pkgs");
    });
    await onServer("touch /var/run/reboot-required && echo linux-image-7.0.0-12-generic > /var/run/reboot-required.pkgs");
    const restarted = await setup.upgrade("production");
    expect(restarted.exitCode, restarted.output).toBe(0);
    expect(restarted.output).toContain("~ restart redis-server@cache.service");
    expect(restarted.output).toContain("▲ Node.js or a library of the app processes changed: they pick it up on the next deploy");
    expect(restarted.output).toContain("▲ dbus.service uses an old library but is not safe to restart: it picks up the update with the next reboot");
    expect(restarted.output).toContain("▲ root@203.0.113.10 needs a reboot for linux-image-7.0.0-12-generic");
    expect(restarted.output).toContain("→ Reboot it with nuxvel server:upgrade production --reboot");
    expect((await onServer("cat /run/fake-systemctl")).output).toBe("restart redis-server@cache.service\n");

    await onServer(`printf '#!/bin/sh\\necho "systemd-run $*" >> /run/fake-systemctl\\n' > /usr/local/sbin/systemd-run && chmod 755 /usr/local/sbin/systemd-run`);
    onTestFinished(async () => {
      await onServer("rm -f /usr/local/sbin/systemd-run");
    });
    const rebooted = await setup.upgrade("production", "--reboot");
    expect(rebooted.exitCode, rebooted.output).toBe(0);
    expect(rebooted.output).toContain("~ reboot the server in 5 seconds");
    expect((await onServer("tail -n 1 /run/fake-systemctl")).output).toBe("systemd-run --on-active=5 systemctl reboot\n");
  }, 300000);

  it("keeps a sudo rule per deploy user, and lets the sudo helpers change only the apps of the caller", async () => {
    const ledger = appWithFakeSsh({ app: "ledger", user: "ledger", domains: ["ledger.example.com"] });
    expect((await ledger("production")).exitCode).toBe(0);
    expect((await ledger.createApp("production")).exitCode).toBe(0);

    expect((await onServer("ls /etc/sudoers.d/nuxvel-deploy /etc/sudoers.d/nuxvel-ledger")).exitCode).toBe(0);
    expect((await onServer("ls /etc/sudoers.d/nuxvel")).exitCode).not.toBe(0);

    const helpers = "/usr/local/lib/nuxvel";
    const asUser = (user: string, command: string) => onServer(`runuser -u ${user} -- ${command} 2>&1`);
    const siteBefore = (await onServer("sha256sum /etc/caddy/sites/shop.caddy 2>&1; true")).output;
    const erasuresBefore = (await onServer("cat /srv/nuxvel/erasures/shop.jsonl 2>&1; true")).output;

    expect((await asUser("ledger", "cat /srv/apps/shop/shared/.env")).exitCode).not.toBe(0);

    const siteOfOther = await asUser("ledger", `sudo -n ${helpers}/caddy-site shop blue`);
    expect(siteOfOther.exitCode).toBe(2);
    expect(siteOfOther.output).toContain("You do not own /srv/apps/shop, so you cannot change the app shop");
    expect((await onServer("sha256sum /etc/caddy/sites/shop.caddy 2>&1; true")).output).toBe(siteBefore);

    const erasureOfOther = await asUser("ledger", `sudo -n ${helpers}/erasure shop u_1`);
    expect(erasureOfOther.exitCode).toBe(2);
    expect((await onServer("cat /srv/nuxvel/erasures/shop.jsonl 2>&1; true")).output).toBe(erasuresBefore);

    const assetsOfOther = await asUser("ledger", `sudo -n ${helpers}/assets shop add < /dev/null`);
    expect(assetsOfOther.exitCode).toBe(2);
    expect(assetsOfOther.output).toContain("You do not own /srv/apps/shop, so you cannot change the app shop");
    expect((await asUser("deploy", `sudo -n ${helpers}/caddy-site ledger blue`)).exitCode).toBe(2);
    expect((await asUser("ledger", `sudo -n ${helpers}/caddy-site ledger blue`)).exitCode).toBe(0);
    expect((await asUser("deploy", `sudo -n ${helpers}/caddy-site shop blue`)).exitCode).toBe(0);

    await onServer(
      "printf 'deploy ALL=(root) NOPASSWD: /usr/local/lib/nuxvel/caddy-site, /usr/local/lib/nuxvel/erasure\\n' > /etc/sudoers.d/nuxvel && chmod 440 /etc/sudoers.d/nuxvel",
    );
    const again = await appWithFakeSsh()("production");
    expect(again.exitCode, again.output).toBe(0);
    expect(again.output).toContain("let deploy run only caddy-site, erasure and assets");
    expect((await onServer("ls /etc/sudoers.d/nuxvel")).exitCode).not.toBe(0);
    expect((await onServer("ls /etc/sudoers.d/nuxvel-deploy")).exitCode).toBe(0);
  }, 300000);
});
