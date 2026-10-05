import { HeadObjectCommand, NotFound } from "@aws-sdk/client-s3";
import { defineEventHandler } from "h3";
import superjson from "superjson";
import { useBucket } from "../../storage/bucket";
import { useS3 } from "../../storage/client";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { key } = await readSuperjsonBody<{ key: string }>(event);

  return superjson.serialize(
    await settle(async () => {
      try {
        const head = await useS3().send(new HeadObjectCommand({ Bucket: useBucket(), Key: key }));

        return { contentType: head.ContentType, size: head.ContentLength ?? 0 };
      } catch (error) {
        if (error instanceof NotFound) return null;

        throw error;
      }
    }),
  );
});
