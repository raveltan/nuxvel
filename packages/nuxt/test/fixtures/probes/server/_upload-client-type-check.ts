import { guest } from "@nuxvel/nuxt/testing";

export const uploadedKey: Promise<string> = guest().upload("profile-avatar", new File([], "a.png"));

// @ts-expect-error an upload name that server/uploads/ does not define
guest().upload("no-such-upload", new File([], "a.png"));
