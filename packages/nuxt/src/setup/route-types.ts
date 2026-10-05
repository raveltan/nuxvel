import { addTypeTemplate } from "@nuxt/kit";
import { buildUploadRoutesTypes } from "../upload-routes";
import { buildValidatedRoutesTypes } from "../validated-routes";
import { buildH3ContextTypes } from "../h3-context";
import type { NitroScan } from "./nitro-scan";
import type { RuntimeFile } from "./resolved-options";

export function addRouteTypes(nitroScan: NitroScan, runtimeFile: RuntimeFile) {
  addTypeTemplate(
    {
      filename: "types/nuxvel-upload-routes.d.ts",
      getContents: () =>
        buildUploadRoutesTypes(
          runtimeFile("./runtime/server/storage/registry"),
          runtimeFile("./runtime/server/storage/define-upload"),
        ),
    },
    { nuxt: true, nitro: true },
  );
  addTypeTemplate(
    {
      filename: "types/nuxvel-validated-routes.d.ts",
      getContents: async () => buildValidatedRoutesTypes(await nitroScan.scannedHandlers()),
    },
    { nuxt: true, nitro: true },
  );

  addTypeTemplate(
    { filename: "types/nuxvel-h3.d.ts", getContents: buildH3ContextTypes },
    { nuxt: true, nitro: true },
  );
}
