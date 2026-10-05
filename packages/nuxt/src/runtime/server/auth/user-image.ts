import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

const USER_INPUT_PATHS = ["/sign-up/email", "/update-user"];

export function refuseImageInput(): BetterAuthPlugin {
  return {
    id: "nuxvel-user-image",
    hooks: {
      before: [
        {
          matcher: (context) => USER_INPUT_PATHS.includes(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const image: unknown = ctx.body?.image;

            if (image !== undefined && image !== null) {
              throw APIError.from("BAD_REQUEST", {
                code: "IMAGE_NOT_ACCEPTED",
                message: "The user image is set by the app, not by this request",
              });
            }
          }),
        },
      ],
    },
  };
}
