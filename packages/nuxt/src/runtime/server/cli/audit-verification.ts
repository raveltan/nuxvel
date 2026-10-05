import { z } from "zod";

/**
 * What the `audit:verify` command writes for the CLI: how many rows of
 * the audit chain verified, and the first row where it breaks, if any.
 *
 * @internal Shared by the module's `audit:verify` command and
 * `@nuxvel/cli`; not meant for app code.
 */
export const auditVerificationSchema = z.object({
  intact: z.boolean(),
  checked: z.number(),
  firstBreak: z
    .union([
      z.object({ id: z.number(), reason: z.enum(["modified", "unlinked", "context-modified"]) }),
      z.object({ id: z.string(), reason: z.literal("subject-modified") }),
    ])
    .nullable(),
});

/** @internal See {@link auditVerificationSchema}. */
export type AuditVerification = z.infer<typeof auditVerificationSchema>;
