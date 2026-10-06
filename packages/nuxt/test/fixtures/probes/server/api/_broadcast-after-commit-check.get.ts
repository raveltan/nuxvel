export default defineEventHandler(async () => {
  await transaction(async () => {
    await $channels._probePublic.broadcast("renamed", { id: 1 });
    throw new Error("roll back");
  }).catch(() => {});

  let rejected = false;

  await transaction(async () => {
    // @ts-expect-error the runtime check behind the compile-time one
    rejected = await $channels._probePublic.broadcast("renamed", { id: "3" }).then(
      () => false,
      (error: unknown) => error instanceof ValidationFailedError,
    );
    await $channels._probePublic.broadcast("renamed", { id: 2 });
  });

  return { rejected };
});
