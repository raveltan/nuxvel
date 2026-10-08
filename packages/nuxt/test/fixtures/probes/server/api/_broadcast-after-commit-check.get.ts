import _probePublicChannel from "#server/channels/_probe-public";
import { ValidationFailedError } from "@nuxvel/nuxt/server/api";
import { transaction } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  await transaction(async () => {
    await _probePublicChannel.broadcast("renamed", { id: 1 });
    throw new Error("roll back");
  }).catch(() => {});

  let rejected = false;

  await transaction(async () => {
    // @ts-expect-error the runtime check behind the compile-time one
    rejected = await _probePublicChannel.broadcast("renamed", { id: "3" }).then(
      () => false,
      (error: unknown) => error instanceof ValidationFailedError,
    );
    await _probePublicChannel.broadcast("renamed", { id: 2 });
  });

  return { rejected };
});
