import { generateOpenApiDocument, type OpenAPIObject } from "trpc-to-openapi";
import { useNuxvelConfig } from "../utils/config";
import { appRouter } from "./router";

export function openApiDocument(): OpenAPIObject | undefined {
  const { api } = useNuxvelConfig();

  if (!api?.openapi || !api.restPrefix) return undefined;

  return generateOpenApiDocument(appRouter, {
    ...api.openapi,
    baseUrl: api.restPrefix,
    securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: "An API key, nxk_…" } },
  });
}
