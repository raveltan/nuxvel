import type socialProviders from "#nuxvel/social-providers";

/**
 * A provider `nuxvel.auth.social` turns on, such as `"github"`. It is
 * `never` while no provider is on.
 */
export type SocialProvider = (typeof socialProviders)[number];
