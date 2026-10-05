import { z } from "zod";

export default defineValidatedHandler(
  {
    params: z.object({ slug: z.string().min(3) }),
    query: z.object({ draft: z.stringbool().optional() }),
    body: z.object({ title: z.string().min(1), tags: z.array(z.string()).default([]) }),
  },
  (_event, { params, query, body }) => ({ slug: params.slug, draft: query.draft ?? false, title: body.title, tags: body.tags }),
);
