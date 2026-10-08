import { z } from "zod";
import { FakeSdkError } from "~~/server/errors/_fake-sdk";
import { defineAction, systemActor } from "@nuxvel/nuxt/server/actions";
import { isTaxonomyError } from "@nuxvel/nuxt/server/api";

const callSdk = probeNamed("_error-classifier-check.callSdk", defineAction({
  input: z.object({ type: z.enum(["duplicate_customer", "server_error"]) }),
  transaction: false,
  handler: async ({ type }) => {
    throw new FakeSdkError(type);
  },
}));

async function thrownCode(type: "duplicate_customer" | "server_error") {
  try {
    await callSdk({ type }, { actor: systemActor("_error-classifier-check") });
    return "no error";
  } catch (error) {
    if (isTaxonomyError(error, "CONFLICT")) return `${error.code}: ${error.message}`;
    if (isTaxonomyError(error, "SERVICE_UNAVAILABLE")) return error.code;

    return "unclassified";
  }
}

export default defineEventHandler(async () => ({
  duplicate: await thrownCode("duplicate_customer"),
  serverError: await thrownCode("server_error"),
}));
