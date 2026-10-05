import { type MaybeRefOrGetter, ref, toValue } from "vue";
import { z } from "zod";
import { useI18n } from "#imports";
import type { UploadName } from "../../server/storage/registry";

const refusal = z.object({
  data: z.object({
    data: z.object({ message: z.string(), fields: z.record(z.string(), z.array(z.string())).optional() }),
  }),
});

function refusalMessage(error: unknown) {
  const body = refusal.safeParse(error).data?.data.data;

  if (!body) return error instanceof Error ? error.message : String(error);

  return Object.values(body.fields ?? {}).flat()[0] ?? body.message;
}

/**
 * Uploads files from the browser to a `defineUpload()` upload.
 *
 * Auto-imported in the app. Call it inside `setup()`, since it reads the
 * locale with `useI18n()`. `upload(file)` asks `POST /api/uploads/<name>`
 * for a presigned URL, sends the file there with a `PUT`, and resolves to
 * the key under `tmp/<name>/`. Send that key to an action that calls
 * `promoteUpload()`. While it runs, `uploading` is `true` and `progress`
 * is the percentage sent, or `null` when the browser cannot tell.
 *
 * `upload()` rejects with an `Error` whose message is readable: the
 * server's reason for a refused file (too large, wrong type, not
 * allowed), or what went wrong with storage, in the current locale. `<UploadField>` uses this
 * composable; use it directly for your own file input.
 *
 * @param name The upload's name, as in `server/uploads/<name>.ts`.
 *
 * @example
 * ```ts
 * const { upload, uploading, progress } = useUpload("post-cover");
 *
 * async function onFile(file: File) {
 *   form.state.coverKey = await upload(file);
 * }
 * ```
 */
export function useUpload(name: MaybeRefOrGetter<UploadName>) {
  const { ts } = useI18n();
  const uploading = ref(false);
  const progress = ref<number | null>(null);

  function put(url: string, headers: Record<string, string>, body: File) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("PUT", url);
      for (const [header, value] of Object.entries(headers)) request.setRequestHeader(header, value);
      request.upload.onprogress = (event) => {
        progress.value = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null;
      };
      request.onload = () =>
        request.status < 300 ? resolve() : reject(new Error(ts("nuxvel.upload.refused", { status: request.status })));
      request.onerror = () => reject(new Error(ts("nuxvel.upload.unreachable")));
      request.send(body);
    });
  }

  async function upload(file: File): Promise<string> {
    uploading.value = true;
    progress.value = 0;

    try {
      const presigned = await $fetch<{ url: string; headers: Record<string, string>; key: string }>(`/api/uploads/${toValue(name)}`, {
        method: "POST",
        body: { type: file.type, size: file.size },
      }).catch((error: unknown) => {
        throw new Error(refusalMessage(error), { cause: error });
      });

      await put(presigned.url, presigned.headers, file);

      return presigned.key;
    } finally {
      uploading.value = false;
    }
  }

  return { upload, uploading, progress };
}
