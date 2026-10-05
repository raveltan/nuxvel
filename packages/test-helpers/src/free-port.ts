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

export async function freePort(): Promise<number> {
  const port = FIRST_PORT + portBlock() * BLOCK_SIZE + Math.floor(Math.random() * BLOCK_SIZE);

  return (await listenable(port, "127.0.0.1")) && (await listenable(port, "0.0.0.0")) ? port : freePort();
}
