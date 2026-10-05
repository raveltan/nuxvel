import { writeFile } from "node:fs/promises";
import { openApiDocument } from "../trpc/openapi-document";
import { CommandError, commandSuccess } from "./command-error";

export async function runOpenApiExport(outFile: string | undefined): Promise<number> {
  const document = openApiDocument();

  if (!document) {
    throw new CommandError("nuxvel.api.openapi is not set", {
      hint: 'Add nuxvel: { api: { openapi: { title: "My API", version: "1.0.0" } } } to nuxt.config.ts',
    });
  }

  const json = JSON.stringify(document, null, 2);

  if (!outFile) {
    console.log(json);
    return 0;
  }

  await writeFile(outFile, `${json}\n`);
  commandSuccess(`Wrote the OpenAPI document to ${outFile}`);

  return 0;
}
