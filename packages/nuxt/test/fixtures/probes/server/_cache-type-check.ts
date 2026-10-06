type IsAny<T> = 0 extends 1 & T ? true : false;

export async function rememberInfersTheValue() {
  const value = await remember("probe", 60, async () => ({ at: new Date(), count: 1 }));
  const inferred: IsAny<typeof value> extends true ? never : typeof value extends { at: Date; count: number } ? true : never =
    true;

  const fromArray = await remember(["probe", { page: 1 }], 60, () => [1, 2]);
  const arrayInferred: IsAny<typeof fromArray> extends true ? never : typeof fromArray extends number[] ? true : never = true;

  // @ts-expect-error a key is a string or an array of parts
  await remember(1, 60, () => 1);

  // @ts-expect-error a duration takes seconds, minutes, hours or days
  await remember("probe", { weeks: 1 }, () => 1);

  return [inferred, arrayInferred];
}

export async function withLockInfersTheResult() {
  const result = await withLock("probe", { seconds: 30 }, async () => ({ id: 1 }));
  const inferred: IsAny<typeof result> extends true ? never : typeof result extends { id: number } ? true : never = true;

  return inferred;
}
