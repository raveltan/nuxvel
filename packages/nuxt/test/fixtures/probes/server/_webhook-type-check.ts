import { z } from "zod";

type IsAny<T> = 0 extends 1 & T ? true : false;

type Exactly<T, Expected> = IsAny<T> extends true
  ? never
  : [T] extends [Expected]
    ? [Expected] extends [T]
      ? true
      : never
    : never;

export const typedWebhookCheck = defineWebhook({
  payload: z.object({ id: z.string(), count: z.string().transform(Number) }),
  verify: ({ rawBody, headers }) => {
    const rawBodyIsString: Exactly<typeof rawBody, string> = true;
    const headersAreHeaders: Exactly<typeof headers, Headers> = true;
    return rawBodyIsString && headersAreHeaders && false;
  },
  eventId: ({ payload }) => {
    const typed: Exactly<typeof payload, { id: string; count: number }> = true;
    return String(typed) + payload.id;
  },
  handler: ({ payload }) => {
    const typed: Exactly<typeof payload, { id: string; count: number }> = true;
    void typed;
  },
});

export const untypedWebhookCheck = defineWebhook({
  verify: () => false,
  eventId: ({ payload }) => {
    const unknownPayload: Exactly<typeof payload, unknown> = true;
    return String(unknownPayload);
  },
  handler: () => {},
});

export const eventIdReadsNoHeaderCheck = defineWebhook({
  verify: () => false,
  // @ts-expect-error eventId reads only the signed payload, never a header
  eventId: ({ headers }) => String(headers),
  handler: () => {},
});
