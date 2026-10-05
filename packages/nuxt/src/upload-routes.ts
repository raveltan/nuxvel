/**
 * Builds the type declaration that gives every discovered upload's
 * `POST /api/uploads/<name>` route its {@link PresignedUpload} response
 * in `$fetch`, from the runtime's upload registry.
 */
export function buildUploadRoutesTypes(registry: string, definition: string) {
  return `import type { UploadName } from ${JSON.stringify(registry)};
import type { PresignedUpload } from ${JSON.stringify(definition)};

declare module "nitropack/types" {
  interface InternalApi extends Record<\`/api/uploads/\${UploadName}\`, { post: PresignedUpload }> {}
}

export {};
`;
}
