async function remembered() {
  let calls = 0;
  const compute = () => {
    calls += 1;
    return { at: new Date("2026-09-25T10:00:00Z"), calls };
  };

  const first = await remember("probe:remembered", 60, compute);
  const second = await remember("probe:remembered", 60, compute);
  const callsBeforeForget = calls;

  await cacheForget("probe:remembered");
  const afterForget = await remember("probe:remembered", 60, compute);

  return { first, second, callsBeforeForget, afterForget, secondIsDate: second.at instanceof Date };
}

async function tagged() {
  await remember("probe:tagged-a", 60, () => "a", { tags: ["probe-posts"] });
  await cachePut("probe:tagged-b", "b", { minutes: 1 }, { tags: ["probe-posts"] });
  await cachePut("probe:untagged", "c", 60);
  await cacheFlush("probe-posts");

  return {
    a: (await cacheGet("probe:tagged-a")) ?? null,
    b: (await cacheGet("probe:tagged-b")) ?? null,
    untagged: (await cacheGet("probe:untagged")) ?? null,
  };
}

async function transactional() {
  await transaction(async () => {
    await remember("probe:rolled-back", 60, () => "never");
    throw new Error("roll back");
  }).catch(() => {});

  const beforeCommit = await transaction(async () => {
    await remember("probe:committed", 60, () => "kept");
    return (await cacheGet("probe:committed")) ?? null;
  });

  return {
    rolledBack: (await cacheGet("probe:rolled-back")) ?? null,
    beforeCommit,
    committed: (await cacheGet("probe:committed")) ?? null,
  };
}

async function globbed() {
  await cachePut("probe:glob:1", 1, 60);
  await cachePut("probe:glob:2", 2, 60);
  await cachePut("probe:other", 3, 60);
  await cacheForget("probe:glob:*");

  return {
    first: (await cacheGet("probe:glob:1")) ?? null,
    second: (await cacheGet("probe:glob:2")) ?? null,
    other: (await cacheGet("probe:other")) ?? null,
  };
}

async function arrays() {
  await cachePut(["probe", "array", { page: 1, q: "a" }], "stored", 60);
  const remembered = await remember(["probe", "array", 2], 60, () => "computed");

  await cachePut(["probe", "prefix"], 1, 60);
  await cachePut(["probe", "prefix", { page: 1 }], 2, 60);
  await cachePut("probe:prefix:list:deep", 3, 60);
  await cachePut("probe:prefixed", 4, 60);
  await cachePut("probe:st*r:1", 5, 60);
  await cachePut("probe:star:1", 6, 60);
  await cacheForget(["probe", "prefix"]);
  await cacheForget(["probe", "st*r"]);

  return {
    sortedObjectKeys: (await cacheGet(["probe", "array", { q: "a", page: 1 }])) ?? null,
    asString: (await cacheGet('probe:array:{"page":1,"q":"a"}')) ?? null,
    remembered,
    rememberedAsString: (await cacheGet("probe:array:2")) ?? null,
    forgotten: [
      (await cacheGet("probe:prefix")) ?? null,
      (await cacheGet(["probe", "prefix", { page: 1 }])) ?? null,
      (await cacheGet("probe:prefix:list:deep")) ?? null,
      (await cacheGet("probe:st*r:1")) ?? null,
    ],
    kept: [(await cacheGet("probe:prefixed")) ?? null, (await cacheGet("probe:star:1")) ?? null],
  };
}

async function expiring() {
  await cachePut("probe:expiring", "soon", { minutes: 1 });

  return { stored: await cacheGet("probe:expiring") };
}

async function locked() {
  const whileHeld = await withLock("probe:lock", 60, () =>
    withLock("probe:lock", 60, () => "ran").catch((error: unknown) => (error instanceof ConflictError ? "conflict" : error)),
  );
  const afterRelease = await withLock("probe:lock", 60, () => "ran");
  await withLock("probe:lock", 60, () => {
    throw new Error("fails");
  }).catch(() => {});
  const afterThrow = await withLock("probe:lock", 60, () => "ran");

  const redis = useRedis("cache");
  await withLock("probe:taken-over", 60, async () => {
    const [key] = await redis.keys("*lock:probe:taken-over");
    await redis.set(key ?? "", "other caller");
  });
  const [takenOver] = await redis.keys("*lock:probe:taken-over");
  const otherLock = await redis.get(takenOver ?? "");
  await redis.del(takenOver ?? "");

  return { whileHeld, afterRelease, afterThrow, otherLock };
}

export default defineEventHandler(async (event) => {
  const { scenario, key } = getQuery(event);

  if (scenario === "remembered") return remembered();
  if (scenario === "tagged") return tagged();
  if (scenario === "transactional") return transactional();
  if (scenario === "expiring") return expiring();
  if (scenario === "globbed") return globbed();
  if (scenario === "arrays") return arrays();
  if (scenario === "locked") return locked();

  return { value: (await cacheGet(String(key))) ?? null };
});
