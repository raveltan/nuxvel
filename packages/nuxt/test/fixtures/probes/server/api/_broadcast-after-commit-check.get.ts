export default defineEventHandler(async () => {
  await transaction(async () => {
    await broadcastAfterCommit($channels._probePublic, "renamed", { id: 1 });
    throw new Error("roll back");
  }).catch(() => {});

  let rejected = false;

  await transaction(async () => {
    // @ts-expect-error the runtime check behind the compile-time one
    rejected = await broadcastAfterCommit("_probe-public", "renamed", { id: "3" }).then(
      () => false,
      (error: unknown) => error instanceof ValidationFailedError,
    );
    await broadcastAfterCommit("_probe-public", "renamed", { id: 2 });
  });

  return { rejected };
});
