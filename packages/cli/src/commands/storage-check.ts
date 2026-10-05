import { defineCommand } from "citty";
import { loadEnvFile } from "../env/load-env-file.ts";
import { checkStorage } from "../storage/check-storage.ts";
import { success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "storage:check",
    description: "Write, read and delete a file in NUXT_STORAGE_BUCKET, and check that storage enforces signed upload lengths.",
  },
  async run() {
    loadEnvFile(process.cwd());

    const { bucket } = await checkStorage();

    success(`Wrote, read and deleted a file in ${bucket}`);
    success(`${bucket} refuses an upload longer than its signed Content-Length`);
  },
});
