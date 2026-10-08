import { userTable } from "~~/server/database/schema/auth.schema";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";
import { defineUserData } from "@nuxvel/nuxt/server/privacy";

export const declaresAStringColumnOfItsOwnTable = defineUserData(postsTable, postsTable.authorId);

// @ts-expect-error the column belongs to posts, not user
export const rejectsAnotherTablesColumn = defineUserData(userTable, postsTable.authorId);

// @ts-expect-error a serial id cannot hold a user's id
export const rejectsANonStringColumn = defineUserData(healthChecksTable, healthChecksTable.id);

// @ts-expect-error a personal column must belong to the declared table
export const rejectsAnotherTablesPersonalColumn = defineUserData(userTable, userTable.id, { personal: [postsTable.title] });
