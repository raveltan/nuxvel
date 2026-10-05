import { defineEventHandler } from "h3";
import { openApiDocument } from "../trpc/openapi-document";

export default defineEventHandler(() => openApiDocument());
