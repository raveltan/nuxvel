export default defineEventHandler(async () => {
  await broadcast($channels._probePublic, "renamed", { id: 1 });

  // @ts-expect-error the runtime check behind the compile-time one
  const rejected = await broadcast("_probe-public", "renamed", { id: "1" }).then(
    () => false,
    (error: unknown) => error instanceof ValidationFailedError,
  );

  return { rejected };
});
