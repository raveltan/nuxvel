import { randomUUID } from "node:crypto";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { useS3 } from "@nuxvel/nuxt/server/storage";
import { z } from "zod";

export default {
  query: publicProcedure
    .meta({ openapi: { method: "GET", path: "/_error-leak/{kind}", protect: false } })
    .input(failureKindSchema)
    .output(z.object({}))
    .query(({ input }) => provokeFailure(input.kind)),
  mutation: publicProcedure.input(failureKindSchema).mutation(({ input }) => provokeFailure(input.kind)),
  unknown: publicProcedure.query(() => {
    throw new UnknownError("leak_probe_secret in an UnknownError");
  }),
  copyMissingObject: publicProcedure.mutation(() =>
    useS3().send(new CopyObjectCommand({ Bucket: useBucket(), CopySource: `${useBucket()}/tmp/_avatar/${randomUUID()}`, Key: "leak_probe_secret/avatar" })),
  ),
};
