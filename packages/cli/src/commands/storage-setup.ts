import { defineCommand } from "citty";
import { loadEnvFile } from "../env/load-env-file.ts";
import { setupStorage } from "../storage/setup-storage.ts";
import { success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "storage:setup",
    description: "Create the NUXT_STORAGE_BUCKET bucket if missing and expire its tmp/ uploads after a day.",
  },
  async run() {
    loadEnvFile(process.cwd());

    const { bucket, created } = await setupStorage();

    success(created ? `Created bucket ${bucket}` : `Bucket ${bucket} already exists`);
    success(`Uploads under ${bucket}/tmp/ expire after 1 day`);
  },
});
