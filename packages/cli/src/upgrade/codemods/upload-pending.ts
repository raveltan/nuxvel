import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { uploadPending as rule } from "../rules/upload-pending.ts";

export const uploadPending: Codemod = {
  name: "upload-pending",
  version: "0.3.0",
  description:
    "Renames uploading of useUpload() to isPending: a destructured uploading becomes isPending, or isPending: uploading when the file uses the name elsewhere, and .uploading on its result becomes .isPending",
  files: ["**/*.{ts,vue}"],
  rewrite: ruleRewrite("upload-pending", { meta: { name: "nuxvel-upgrade" }, rules: { "upload-pending": rule } }),
};
