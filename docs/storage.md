# Storage

## Introduction

nuxvel keeps files in S3-compatible object storage. The browser uploads each file directly to storage through a presigned URL, and your server never receives the bytes. You define each kind of upload in a file, then move a finished upload to a permanent key. Use storage for files that users send, such as the cover image of a post.

## Configuration

```
NUXT_STORAGE_URL=http://nuxvel:nuxvel-secret@localhost:8333
NUXT_STORAGE_BUCKET=nuxvel
```

| Variable | Use |
|---|---|
| `NUXT_STORAGE_URL` | The S3 endpoint. Its user and password are the access key and the secret. |
| `NUXT_STORAGE_BUCKET` | The bucket that uploads go to. |
| `NUXT_STORAGE_PUBLIC_URL` | Optional. The address browsers reach the storage on, such as `https://files.example.com`, when the server reaches it on another one. Upload URLs and `signedReadUrl()` point there, signed with the keys of `NUXT_STORAGE_URL`. |

Neither `NUXT_STORAGE_URL` nor `NUXT_STORAGE_BUCKET` has a default. When one is not set, the first call that needs it throws an error that names the variable. In production, a server does not start without both when `server/uploads/` defines an upload.

`docker compose up -d` starts [SeaweedFS](https://github.com/seaweedfs/seaweedfs) for development. Its S3 gateway listens on `localhost:8333`. In production, set the same variables for managed S3, R2 or your own SeaweedFS.

### Creating the bucket

```bash
nuxvel storage:setup
```

The command creates the bucket when it does not exist. It also adds a lifecycle rule that deletes every file under `tmp/` after one day. You can run it again safely. See the [CLI reference](./cli.md#nuxvel-storagesetup).

### Managed S3 or R2

`nuxvel storage:setup` does not set the CORS rule of the bucket. Without the rule, the browser cannot send a file to storage. On a server from [`nuxvel server:setup`](./deploy.md#setting-up-the-server), nuxvel sets the rule. For managed S3 or R2, set it in the console of the provider:

```json
[
  {
    "AllowedOrigins": ["https://tasks.example.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Put each domain of the app in `AllowedOrigins`. Keep the public access of the bucket blocked. The app shows a file only through a [signed URL](#showing-a-stored-file). Give the app an access key for this bucket only.

### Checking the storage backend

```bash
nuxvel storage:check
```

The command writes, reads and deletes a file in the bucket. It also checks that storage refuses an upload that is longer than its signed `Content-Length`. Uploads depend on this check. See the [CLI reference](./cli.md#nuxvel-storagecheck).

## Using the S3 client

```ts
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

await useS3().send(
  new PutObjectCommand({ Bucket: useBucket(), Key: "exports/posts.csv", Body: csv }),
);

const object = await useS3().send(
  new GetObjectCommand({ Bucket: useBucket(), Key: "exports/posts.csv" }),
);
```

`useS3()` returns the S3 client of the app. nuxvel creates it one time and uses it again for each call. Send it any `@aws-sdk/client-s3` command. It throws when `NUXT_STORAGE_URL` is not set or is not a URL.

A call throws a `TimeoutError` when the connection to storage takes more than 5 seconds, or when the connection sends and receives no data for 30 seconds. A long upload or download that continues to send data does not time out.

`useBucket()` returns the value of `NUXT_STORAGE_BUCKET`. It throws when the variable is not set.

The name is `useS3`, not `useStorage`. Nitro's own `useStorage()` is still available for its key-value storage.

## Uploads

```ts
// server/uploads/post-cover.upload.ts
export const postCoverUpload = defineUpload({
  maxSize: 2 * 1024 * 1024,
  allowedTypes: ["image/png", "image/jpeg"],
  authorize: ({ user }) => user !== null,
});
```

Put one upload in each file under `server/uploads/`. nuxvel finds the file. You do not register it.

The path of the file is the name of the upload. It is also the last segment of its URL. The file above is `post-cover`, served at `POST /api/uploads/post-cover`. The file `server/uploads/post/cover.upload.ts` is `post.cover`.

| Option | Use |
|---|---|
| `maxSize` | The largest accepted file, in bytes. |
| `allowedTypes` | The accepted MIME types. A type must match exactly. |
| `authorize` | Decides if this request gets an upload URL. It gets the signed-in `user`, or `null` for a guest. |
| `svg` | What happens to an SVG file: `"reject"` (the default), `"rasterize"` or `"sanitize"`. See [SVG files](#svg-files). |
| `rateLimit` | The limit on the requests for an upload URL, with the options of [`rateLimit()`](./security.md#limiting-a-route-procedure-or-action). Each upload has a limit. When you do not set it, the limit is 30 requests per minute for each IP. |

### Uploading from the browser

```ts
const presigned = await $fetch("/api/uploads/post-cover", {
  method: "POST",
  body: { type: file.type, size: file.size },
});

await fetch(presigned.url, {
  method: "PUT",
  headers: presigned.headers,
  body: file,
});
```

The browser asks for a URL with the type and the size of the file. Then it sends the file to that URL with `PUT`.

In a Nuxt UI form, use `<UploadField>`. Give it `field` (the form state key that holds the key), so that an error on that key shows under it. It does these two steps, shows the progress and puts the key in the form state. The model can be `undefined`, so a field of an optional image works. For your own file input, `useUpload(name)` does the two steps and reports the progress. See [File uploads](./frontend.md#file-uploads).

The response is `{ url, key, headers }`. `$fetch` knows this type for every upload under `server/uploads/`, so you do not give a type argument. The URL expires after 10 minutes.

`key` is the location of the file, under `tmp/post-cover/`. For a signed-in user, the key is `tmp/post-cover/<user id>/<uuid>`. For a guest, it is `tmp/post-cover/<uuid>`. Do not store this key. The `storage:setup` lifecycle rule deletes everything under `tmp/` after one day. This deletes abandoned uploads, and it also deletes a file that you forgot to move.

Managed S3 and R2 apply the rule themselves. SeaweedFS stores the rule, but `weed server` does not apply it. On a server from [`nuxvel server:setup`](./deploy.md#setting-up-the-server), the timer `nuxvel-storage-lifecycle` applies it every hour. In development, nothing applies it, so `tmp/` does not empty.

### Rejected requests

```json
{
  "statusCode": 400,
  "statusMessage": "Invalid input",
  "data": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "fields": { "size": ["Must be at most 2097152 bytes"] }
  }
}
```

The endpoint gives no URL in these cases:

| Status | When |
|---|---|
| `400` | The size is more than `maxSize`, or the type is not in `allowedTypes`. An SVG also gets `400` when `svg` is `"reject"`. |
| `403` | `authorize` returns `false`. The code is `FORBIDDEN`. |
| `429` | The request is over the `rateLimit` of the upload. The code is `TOO_MANY_REQUESTS`, and `Retry-After` gives the seconds to wait. |
| `404` | No file defines an upload with that name. The code is `NOT_FOUND`. |

A `400` is a normal [validation error](./validation.md#error-shape). Each status has the same body shape. A failed `$fetch` holds `{ code, message }` on `error.data.data`.

The limits also apply to a client that sends false values. The URL is signed for the declared `Content-Length` and `Content-Type` only. Storage rejects a `PUT` with a different size or type.

### SVG files

```ts
// server/uploads/post-logo.upload.ts
export const postLogoUpload = defineUpload({
  maxSize: 256 * 1024,
  allowedTypes: ["image/png", "image/svg+xml"],
  svg: "rasterize",
  authorize: ({ user }) => user !== null,
});
```

An SVG file can hold scripts that run when a browser opens it. The `svg` option sets what happens to a file of type `image/svg+xml`:

| `svg` | Result |
|---|---|
| `"reject"`, the default | The endpoint refuses an SVG with `400`, also when `allowedTypes` lists it. |
| `"rasterize"` | `promoteUpload()` removes the same content as `"sanitize"`, and also `stroke-dasharray`. Then it converts the SVG to a PNG with [sharp](https://sharp.pixelplumbing.com). It stores the PNG at `to`, with the type `image/png`. |
| `"sanitize"` | `promoteUpload()` keeps only the drawing elements and their attributes, such as `path`, `rect`, `fill` and `viewBox`. It removes scripts, event handlers, links, `<foreignObject>`, `<style>` and `<use>`. It stores the result at `to`, with the type `image/svg+xml`. |

The conversion happens in `promoteUpload()`. Until then, the file in `tmp/` is the file that the browser sent. Files of other types are moved as they are.

The work to convert an SVG increases with its size, its elements and its pixels. Thus `promoteUpload()` refuses an SVG that is more than 256 KB, or that has more than 1000 elements. For `"rasterize"`, it also refuses an SVG that is more than 4 000 000 pixels (for example 2000 × 2000), and an SVG that sharp cannot render. It deletes the file from `tmp/` and throws a validation error on `key`. These limits apply also when `maxSize` is larger. `promoteUpload()` removes `<filter>` elements and dashes before it rasterizes, because they make the render slow. sharp renders on the libuv thread pool, not on the event loop. Inside an action, the conversion holds the database connection of the transaction until it ends.

## Keeping an upload

```ts
// server/actions/posts/set-cover.action.ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { postTable } from "#nuxvel/schema";

export const setCoverAction = defineAction({
  input: z.object({ postId: z.number(), key: z.string() }),
  handler: async ({ postId, key }, ctx) => {
    const coverKey = await promoteUpload({
      upload: "post-cover",
      key,
      to: `covers/${ctx.actor.id}/${randomUUID()}`,
    });

    await useDb().update(postTable).set({ coverKey }).where(eq(postTable.id, postId));
  },
});
```

After the `PUT` succeeds, send the key to the server. `promoteUpload()` moves the file out of `tmp/` to the key in `to`, and returns that key. Store the returned key.

| Option | Use |
|---|---|
| `upload` | The name of the upload, as in `defineUpload()`. |
| `key` | The key that `POST /api/uploads/<name>` returned. |
| `to` | The permanent key. It cannot be under `tmp/`, where the file expires, or under `backups/audit/`, where the [audit log archives](./audit.md) are. For such a key, `promoteUpload()` throws an error and does not move the file. |

The key comes from the browser. `promoteUpload()` accepts only a key in the form that the upload gives, `tmp/post-cover/<user id>/<uuid>` or `tmp/post-cover/<uuid>`. Any other key throws a [validation error](./validation.md) on `key`, and storage is not touched. Examples are a key from a different upload, or `tmp/post-cover/../../covers/someone`.

The key of a signed-in user belongs to that user. When a different user sends it, `promoteUpload()` throws a validation error on `key`: `"Another user uploaded this file"`. The file stays in `tmp/`. `promoteUpload()` gets the current user from [`useAuth()`](./auth.md#the-caller-anywhere-on-the-server), so it also works in a job that the user dispatched. Any user can promote the key of a guest. Thus a guest can upload a file before the sign-up, and the new user can keep it.

### Checking the stored file

Before it moves the file, `promoteUpload()` checks the file in storage:

- The size must be at most the `maxSize` of the upload.
- The first bytes must match the type that the browser declared. For example, a file declared as `image/png` must start like a PNG. The file name and its extension do not count.
- A type without a byte signature, such as `text/plain` or `image/svg+xml`, passes when its first bytes match no known binary type.

The upload URL stays valid for 10 minutes, so the browser can send a different file to the same key after the check. `promoteUpload()` moves only the file that it checked. It reads the `ETag` of the file before the check, and it sends that `ETag` with each read and with the copy. When the file changed, storage refuses the request, and `promoteUpload()` throws a validation error on `key`: `"The file changed after the check. Upload it again"`.

When a check fails, `promoteUpload()` deletes the file from `tmp/`. Then it throws a [validation error](./validation.md) on `key`, for example `"The file's content is not image/png"` or `"The file is larger than 2097152 bytes"`.

A key without a file in storage also throws a validation error on `key`: `"The file is not in storage. Upload it again"`. This occurs when the browser sends the key of a file that `promoteUpload()` deleted before, or of a file that expired in `tmp/`.

The field `key` is the argument of `promoteUpload()`, not a field of your form. If the form state has no `key` field (for example it has `imageKey`), [`useActionForm()`](./frontend.md#forms) puts the message in `formError`, and not under a field.

### Keeping several files

A form can send more than one file. When `promoteUpload()` refuses the third file, the first two files are already out of `tmp/`. Check every file with `checkUpload()` first, then promote them:

```ts
for (const file of input.files) {
  await checkUpload({ upload: "attachment", key: file.key });
}

for (const file of input.files) {
  await promoteUpload({ upload: "attachment", key: file.key, to: `files/${randomUUID()}` });
}
```

`checkUpload()` does the same checks as `promoteUpload()`, but it does not move the file. It deletes a file that fails a check, and throws the same validation error on `key`.

### When the transaction rolls back

An action runs in a transaction. When `promoteUpload()` runs in a transaction that rolls back, nuxvel deletes the file at `to` after the rollback. The row that points at the file is not saved, so the file does not stay in the bucket without its row.

## Deleting stored files

```ts
const files = await useDb().select({ key: attachmentTable.key }).from(attachmentTable).where(inArray(attachmentTable.ticketId, ids));

await forceDelete(ticketTable, inArray(ticketTable.id, ids));
await deleteStoredFiles(files.map(({ key }) => key));
```

The database does not know the files in the bucket. When you delete rows that point at files, read the keys first, then give them to `deleteStoredFiles()`.

- In a transaction, `deleteStoredFiles()` deletes the files after the commit. When the transaction rolls back, the files stay with their rows.
- Outside a transaction, it deletes the files at once.
- A key without a file in storage is not an error.

`purgeTrashed()` and `nuxvel.database.purgeTrashedAfter` do not delete stored files. To purge rows that point at files, write a [schedule](./queues.md#schedules) that deletes the rows and calls `deleteStoredFiles()`.

## Showing a stored file

```ts
return { coverUrl: post.coverKey ? await signedReadUrl(post.coverKey) : null };
```

The bucket stays private. To show a stored file, sign a read URL when the page asks for it, and send that URL to the page. Do not send the key.

Sign only a key that your server code stored, never a key from the request. `signedReadUrl()` throws for a key under `backups/audit/`, where the [audit log archives](./audit.md) are.

A read URL expires after 10 minutes. Sign a new one for each request, and do not store it. The file answers with `Cache-Control: private`. The browser can keep the file, but a CDN or a proxy does not keep it. Do not put a CDN that ignores the query string in front of storage: it would serve one signed file to all users of that path.

Only raster images, PDF, audio and video open in the browser. The URL of every other type, SVG and HTML included, answers with `Content-Disposition: attachment`. The browser then downloads the file and does not render it. `signedReadUrl()` reads the type of the file from storage, so each call sends one `HEAD` request to storage.

## Content Security Policy

The Content Security Policy of the app lets the page connect only to its own origin. When the app has an upload, the server adds the storage origin to `connect-src` when it starts, so the browser can send the `PUT`. It takes the origin of `NUXT_STORAGE_PUBLIC_URL`, or of `NUXT_STORAGE_URL` when the public URL is not set. It reads them at runtime, so one build serves every environment. On a VPS with `filesDomain` in `nuxvel.deploy.ts`, the origin is `https://<filesDomain>`.

The module does not add the storage origin to `img-src`. For `<img>` tags that show stored files, add it yourself:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  security: {
    headers: {
      contentSecurityPolicy: {
        "img-src": ["'self'", "data:", "https://files.tasks.example.com"],
      },
    },
  },
});
```

See [Serving the app with Caddy](./deploy.md#serving-the-app-with-caddy).

```vue
<img :src="post.coverUrl" crossorigin="anonymous" alt="" />
```

An `<img>` with a stored file also needs `crossorigin="anonymous"`. Without it, the cross-origin embedder policy blocks the image. See [Security](./security.md#security-headers).

## Testing

```ts
import { expect, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postFactory, userFactory } from "#nuxvel/factories";

describe("posts.set-cover", () => {
  it("refuses a key that the upload did not give", async () => {
    const author = await userFactory();
    const post = await postFactory.for("authorId", author)();

    await expect(
      runAction(
        "posts.set-cover",
        { postId: post.id, key: "tmp/post-cover/../../covers/someone" },
        { actingAs: author },
      ),
    ).rejects.toHaveValidationErrors("key");
  });
});
```

`promoteUpload()` checks the key before it calls storage, so this test needs no bucket. A test that uploads a real file needs `NUXT_STORAGE_URL` and `NUXT_STORAGE_BUCKET`, and a bucket made with `nuxvel storage:setup`. See [Testing](./testing.md).

`client.upload(name, file)` uploads a file as the upload `name` of `server/uploads/` and returns its `tmp/` key. It asks for the upload URL as that client, then sends the `File` to it with `PUT`. `name` has the same type as the name of `useUpload()`. A refused request rejects with an error that has `statusCode`: `403` when `authorize` refuses, `400` when `maxSize` or `allowedTypes` refuse. To check the status of the request itself, call `client.fetch("/api/uploads/<name>")`.

```ts
const key = await actingAs(user).upload("post-cover", new File([bytes], "cover.png", { type: "image/png" }));

await expectStored(key);
await expect(guest().upload("post-cover", file)).rejects.toMatchObject({ statusCode: 403 });
```

`expectStored(key)` asserts that the bucket holds an object at `key`. It returns the content type and size of the object. `expectNotStored(key)` asserts that the bucket holds no object at `key`. Tests do not remove objects, so use a key that only the test uses.

```ts
const cover = await expectStored(`covers/${post.id}`);

expect(cover.contentType).toBe("image/png");
```

## See also

- [Actions](./actions.md)
- [Validation](./validation.md)
- [Security](./security.md)
- [CLI reference](./cli.md#nuxvel-storagesetup)
