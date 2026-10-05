import { APIError } from "better-auth/api";

export const MAX_USER_NAME_LENGTH = 200;

export function refuseLongName(user: { name?: unknown }) {
  if (typeof user.name === "string" && user.name.length > MAX_USER_NAME_LENGTH) {
    throw APIError.from("BAD_REQUEST", {
      code: "NAME_TOO_LONG",
      message: `The name has more than ${MAX_USER_NAME_LENGTH} characters`,
    });
  }
}
