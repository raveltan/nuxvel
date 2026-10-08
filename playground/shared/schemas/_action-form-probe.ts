import { z } from "zod";
import { richText } from "@nuxvel/nuxt/shared/html";

export const actionFormProbeInput = z.object({
  teamId: z.number(),
  title: z.string().min(1),
  contactEmail: z.email(),
  website: z.url().optional(),
  bio: z.string().meta({ input: "textarea" }),
  status: z.enum(["draft", "published"]).default("draft"),
  featured: z.boolean().default(false),
  seats: z.number().int(),
  startsOn: z.iso.date(),
  endsAt: z.date(),
  body: richText({ max: 200 }),
  avatarKey: z.string().meta({ upload: "profile-avatar" }).optional(),
  price: z.number().meta({ input: "money" }),
  tags: z.array(z.object({ name: z.string() })).default([]),
});

export const actionFormEdgeProbeInput = z.object({
  teamId: z.number(),
  subtitle: z.string().nullable(),
  website: z.url().optional(),
  richOptional: richText().optional(),
  richNullable: richText().nullable(),
  richDefault: richText().default(richText().parse("")),
  legacy: z.string().meta({ input: "constructor" }).optional(),
});
