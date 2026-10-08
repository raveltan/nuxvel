import _probePublicChannel from "#server/channels/_probe-public";
import { ValidationFailedError } from "@nuxvel/nuxt/server/api";

export default defineEventHandler(async () => {
  await _probePublicChannel.broadcast("renamed", { id: 1 });

  // @ts-expect-error the runtime check behind the compile-time one
  const rejected = await _probePublicChannel.broadcast("renamed", { id: "1" }).then(
    () => false,
    (error: unknown) => error instanceof ValidationFailedError,
  );

  return { rejected };
});
