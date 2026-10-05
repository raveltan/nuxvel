import { z } from "zod";

export const securityChangeSchema = z.enum(["password", "email", "new-sign-in", "two-factor-on", "two-factor-off"]);

export type SecurityChange = z.infer<typeof securityChangeSchema>;
