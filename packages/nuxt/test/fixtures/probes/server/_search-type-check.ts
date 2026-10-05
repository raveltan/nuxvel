import { postsTable } from "~~/server/database/schema/posts.schema";
import { tagsTable } from "~~/server/database/schema/tags.schema";

export const searchesASearchableTable = [search(postsTable, "run"), searchRank(postsTable, "run"), highlight(postsTable.title, "run")];

// @ts-expect-error tags has no searchable() column, so search() rejects it
export const rejectsAPlainTable = search(tagsTable, "run");

// @ts-expect-error tags has no searchable() column, so searchRank() rejects it
export const rejectsAPlainTableRank = searchRank(tagsTable, "run");

// @ts-expect-error highlight() takes a text column, and posts.id is a number
export const rejectsANumberColumn = highlight(postsTable.id, "run");
