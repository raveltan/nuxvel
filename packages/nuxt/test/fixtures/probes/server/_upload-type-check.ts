import { defineUpload } from "@nuxvel/nuxt/server/storage";
import type { UploadName } from "@nuxvel/nuxt/server/storage";

type IsAny<T> = 0 extends 1 & T ? true : false;

export const uploadNameIsTyped: IsAny<UploadName> extends true
  ? never
  : [UploadName] extends ["_avatar" | "_rate-limited" | "_svg-rasterized" | "_svg-rejected" | "_svg-sanitized" | "profile-avatar"]
    ? ["_avatar" | "_rate-limited" | "_svg-rasterized" | "_svg-rejected" | "_svg-sanitized" | "profile-avatar"] extends [UploadName]
      ? true
      : never
    : never = true;

export function definesUploadSizes() {
  defineUpload({ maxSize: 2048, allowedTypes: ["image/png"] });
  defineUpload({ maxSize: "2 MB", allowedTypes: ["image/png"] });
  defineUpload({ maxSize: "1.5 GB", allowedTypes: ["image/png"] });

  // @ts-expect-error a size needs a unit of B, KB, MB or GB
  defineUpload({ maxSize: "2 megabytes", allowedTypes: ["image/png"] });
}
