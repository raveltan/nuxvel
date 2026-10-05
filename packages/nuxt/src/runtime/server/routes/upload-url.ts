import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { defineEventHandler, getRouterParam, readBody } from "h3";
import { z } from "zod";
import { ForbiddenError } from "../errors/forbidden-error";
import { NotFoundError, ValidationFailedError } from "../errors/taxonomy";
import { limitRequest } from "../security/point-of-use";
import { useBucket } from "../storage/bucket";
import { useSigningS3 } from "../storage/signing-client";
import type { PresignedUpload, Upload } from "../storage/define-upload";
import { findUpload } from "../storage/registry";
import { auth } from "../utils/auth";

const URL_EXPIRES_IN_SECONDS = 600;

function requestSchema(upload: Upload) {
  const allowedTypes =
    upload.svg === "reject" ? upload.allowedTypes.filter((type) => type !== "image/svg+xml") : upload.allowedTypes;

  return z.object({
    type: z
      .string()
      .min(1)
      .refine((type) => allowedTypes.includes(type), {
        message: `Must be one of ${allowedTypes.join(", ")}`,
      }),
    size: z.int().positive().max(upload.maxSize, { message: `Must be at most ${upload.maxSize} bytes` }),
  });
}

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name") ?? "";
  const upload = findUpload(name);

  if (!upload) throw new NotFoundError(`No upload is named "${name}"`);

  await limitRequest(upload.rateLimit, `upload/${upload.name}`, event);

  const session = await auth();

  if (!(await upload.authorize({ user: session?.user ?? null }))) {
    throw new ForbiddenError(`Not allowed to upload "${name}"`);
  }

  const result = requestSchema(upload).safeParse(await readBody(event));

  if (!result.success) throw new ValidationFailedError(result.error);

  const { type, size } = result.data;

  const key = ["tmp", upload.name, ...(session ? [session.user.id] : []), randomUUID()].join("/");
  const url = await getSignedUrl(
    useSigningS3(),
    new PutObjectCommand({
      Bucket: useBucket(),
      Key: key,
      ContentLength: size,
      ContentType: type,
    }),
    {
      expiresIn: URL_EXPIRES_IN_SECONDS,
      signableHeaders: new Set(["content-length", "content-type"]),
    },
  );

  const presigned: PresignedUpload = {
    url,
    key,
    headers: { "content-type": type },
  };

  return presigned;
});
