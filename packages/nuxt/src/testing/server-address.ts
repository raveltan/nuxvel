import { createServer } from "node:net";

const FIRST_PORT = 20_000;
const BLOCK_SIZE = 100;
const BLOCKS = 120;

function portBlock() {
  const pool = Number(process.env.VITEST_POOL_ID);
  // the workers of one run share a parent, so each worker gets its own block and a parallel run other blocks
  return Number.isInteger(pool) ? (process.ppid + pool) % BLOCKS : Math.floor(Math.random() * BLOCKS);
}

function listenable(port: number, host: string) {
  const probe = createServer();
  return new Promise<boolean>((resolve) => {
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

async function freePort(): Promise<number> {
  // stay below 32768, where Linux (49152 on macOS) starts the ports it gives outgoing sockets, which can take the port before the server listens
  const port = FIRST_PORT + portBlock() * BLOCK_SIZE + Math.floor(Math.random() * BLOCK_SIZE);

  return (await listenable(port, "127.0.0.1")) && (await listenable(port, "0.0.0.0")) ? port : freePort();
}

export async function serverAddress(options: { port?: number; env?: Record<string, string>; siteUrlConfigured?: boolean }) {
  const port = options.port ?? (await freePort());
  const siteUrl = process.env.NUXT_SITE_URL || `http://127.0.0.1:${port}`;

  const auditChainSecret = process.env.NUXT_AUDIT_CHAIN_SECRET || "nuxvel-test-audit-chain-secret-00000000";

  return {
    port,
    env: {
      ...(options.siteUrlConfigured ? {} : { NUXT_SITE_URL: siteUrl }),
      NUXT_AUDIT_CHAIN_SECRET: auditChainSecret,
      NUXT_STRIPE_SECRET_KEY: process.env.NUXT_STRIPE_SECRET_KEY || "sk_test_nuxvel",
      NUXT_STRIPE_WEBHOOK_SECRET: process.env.NUXT_STRIPE_WEBHOOK_SECRET || "whsec_nuxvel-test",
      ...options.env,
    },
  };
}
