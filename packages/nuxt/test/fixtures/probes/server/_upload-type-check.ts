type IsAny<T> = 0 extends 1 & T ? true : false;

export const uploadNameIsTyped: IsAny<UploadName> extends true
  ? never
  : [UploadName] extends ["_avatar" | "_rate-limited" | "_svg-rasterized" | "_svg-rejected" | "_svg-sanitized" | "profile-avatar"]
    ? ["_avatar" | "_rate-limited" | "_svg-rasterized" | "_svg-rejected" | "_svg-sanitized" | "profile-avatar"] extends [UploadName]
      ? true
      : never
    : never = true;
