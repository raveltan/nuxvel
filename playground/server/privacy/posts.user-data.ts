import { postsTable } from "#nuxvel/schema";
import { defineUserData } from "@nuxvel/nuxt/server/privacy";

export const postsUserData = defineUserData(postsTable);
