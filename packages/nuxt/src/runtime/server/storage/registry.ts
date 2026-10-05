import uploads from "#nuxvel/uploads";
import type { Upload } from "./define-upload";

/** The name of every upload defined under `server/uploads/`. */
export type UploadName = (typeof uploads)[number]["name"];

function definitions(): readonly Upload[] {
  return uploads;
}

/**
 * The discovered upload with this name, or `undefined` when no file under
 * `server/uploads/` defines one.
 *
 * The `POST /api/uploads/<name>` endpoint
 * uses it to find the limits to enforce; see {@link defineUpload}.
 */
export function findUpload(name: string): Upload | undefined {
  return definitions().find((upload) => upload.name === name);
}
