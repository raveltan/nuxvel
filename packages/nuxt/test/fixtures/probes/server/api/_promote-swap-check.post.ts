import { randomUUID } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { useS3 } from "@nuxvel/nuxt/server/storage";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const SWAP = "_swap-after-check";

export default defineEventHandler(async () => {
  const bucket = useBucket();
  const key = `tmp/profile-avatar/${randomUUID()}`;
  const to = `swap-test/${randomUUID()}`;
  const swapped = Buffer.alloc(PNG.byteLength, "<");

  await useS3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: PNG, ContentType: "image/png" }));
  useS3().middlewareStack.add(
    (next, context) => async (args) => {
      const result = await next(args);
      if (context.commandName === "GetObjectCommand" && "Key" in args.input && args.input.Key === key) {
        await useS3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: swapped, ContentType: "image/png" }));
      }
      return result;
    },
    { name: SWAP },
  );

  const refused = await promoteUpload({ upload: "profile-avatar", key, to }).then(
    () => null,
    (error: unknown) => (error instanceof ValidationFailedError ? error.fields : error),
  );

  useS3().middlewareStack.remove(SWAP);

  const moved = await useS3().send(new HeadObjectCommand({ Bucket: bucket, Key: to })).then(() => true, () => false);

  return { refused, moved };
});
