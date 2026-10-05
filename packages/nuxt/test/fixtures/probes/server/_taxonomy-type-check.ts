declare const caught: unknown;

export const taxonomyCodeAccepted = isTaxonomyError(caught, "NOT_FOUND");

// @ts-expect-error PARSE_ERROR is a tRPC code but not a taxonomy code
export const nonTaxonomyCodeRejected = isTaxonomyError(caught, "PARSE_ERROR");

export const narrowedCode: "CONFLICT" | undefined = isTaxonomyError(caught, "CONFLICT")
  ? caught.code
  : undefined;
