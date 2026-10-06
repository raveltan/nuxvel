export default defineEventHandler(async () => {
  await $channels._probePublic.broadcast("renamed", { id: 1 });

  // @ts-expect-error the runtime check behind the compile-time one
  const rejected = await $channels._probePublic.broadcast("renamed", { id: "1" }).then(
    () => false,
    (error: unknown) => error instanceof ValidationFailedError,
  );

  return { rejected };
});
