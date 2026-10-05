import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerEndpoint } from "@nuxt/test-utils/runtime";
import { createError, readBody } from "h3";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { defineComponent, h, reactive } from "vue";
import { UForm, UploadField } from "#components";

class FakeUploadRequest {
  static last: FakeUploadRequest | undefined;

  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(header: string, value: string) {
    this.headers[header] = value;
  }

  send(body: unknown) {
    this.body = body;
    FakeUploadRequest.last = this;
  }

  progress(loaded: number, total: number) {
    this.upload.onprogress?.(new ProgressEvent("progress", { lengthComputable: true, loaded, total }));
  }

  finish(status: number) {
    this.status = status;
    this.onload?.();
  }
}

function sent() {
  return vi.waitUntil(() => FakeUploadRequest.last);
}

describe("useUpload()", () => {
  const asked: unknown[] = [];

  registerEndpoint("/api/uploads/profile-avatar", {
    method: "POST",
    handler: async (event) => {
      const body = await readBody<{ type: string; size: number }>(event);

      asked.push(body);

      if (body.size > 10) {
        throw createError({
          statusCode: 400,
          data: { code: "VALIDATION_ERROR", message: "Invalid input", fields: { size: ["File is too large"] } },
        });
      }

      return {
        url: "https://storage.test/bucket/tmp/profile-avatar/key-1?signed",
        key: "tmp/profile-avatar/key-1",
        headers: { "content-type": body.type },
      };
    },
  });

  beforeEach(() => {
    asked.length = 0;
    FakeUploadRequest.last = undefined;
    vi.stubGlobal("XMLHttpRequest", FakeUploadRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the URL, uploads with progress and reports the key", async () => {
    const { upload, uploading, progress } = useUpload("profile-avatar");
    const file = new File(["png"], "avatar.png", { type: "image/png" });

    const uploaded = upload(file);
    const request = await sent();

    expect(asked).toEqual([{ type: "image/png", size: 3 }]);
    expect(request.method).toBe("PUT");
    expect(request.url).toBe("https://storage.test/bucket/tmp/profile-avatar/key-1?signed");
    expect(request.headers).toEqual({ "content-type": "image/png" });
    expect(request.body).toBe(file);
    expect(uploading.value).toBe(true);

    request.progress(1, 4);
    expect(progress.value).toBe(25);

    request.finish(200);

    await expect(uploaded).resolves.toBe("tmp/profile-avatar/key-1");
    expect(uploading.value).toBe(false);
  });

  it("rejects with the server's reason for a refused file", async () => {
    const { upload, uploading } = useUpload("profile-avatar");

    await expect(upload(new File(["far too large"], "big.png", { type: "image/png" }))).rejects.toThrow("File is too large");
    expect(FakeUploadRequest.last).toBeUndefined();
    expect(uploading.value).toBe(false);
  });

  it("rejects when storage refuses the PUT", async () => {
    const { upload } = useUpload("profile-avatar");

    const uploaded = upload(new File(["png"], "avatar.png", { type: "image/png" }));
    (await sent()).finish(403);

    await expect(uploaded).rejects.toThrow("Storage refused the upload (403)");
  });

  it("mounts UploadField without a value", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await mountSuspended(UploadField, { props: { name: "profile-avatar" } });

    expect(warn.mock.calls.flat().join(" ")).not.toContain("Missing required prop");
    warn.mockRestore();
  });

  it("shows a server error under the form field named by field", async () => {
    const state = reactive({ coverKey: "" });
    const wrapper = await mountSuspended(
      defineComponent({
        setup: () => () =>
          h(UForm, { state, validate: () => [{ name: "coverKey", message: "Cover is required" }] }, () =>
            h(UploadField, { name: "profile-avatar", field: "coverKey", modelValue: state.coverKey }),
          ),
      }),
    );

    await wrapper.get("form").trigger("submit");

    await vi.waitFor(() => expect(wrapper.text()).toContain("Cover is required"));
  });

  it("gives its ui prop to the UFileUpload", async () => {
    const wrapper = await mountSuspended(UploadField, { props: { name: "profile-avatar", ui: { base: "upload-ui-probe" } } });

    expect(wrapper.find(".upload-ui-probe").exists()).toBe(true);
  });

  it("renders its uploading slot with the file and the progress in place of the progress bar", async () => {
    const wrapper = await mountSuspended(UploadField, {
      props: { name: "profile-avatar" },
      slots: {
        uploading: ({ file, progress }: { file: File; progress: number }) => h("p", { class: "upload-probe" }, `${file.name} ${progress}%`),
      },
    });
    const input = wrapper.get<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input.element, "files", { value: [new File(["png"], "avatar.png", { type: "image/png" })] });
    await input.trigger("change");

    const request = await sent();
    request.progress(1, 4);

    await vi.waitFor(() => expect(wrapper.find(".upload-probe").text()).toBe("avatar.png 25%"));
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);

    request.finish(200);

    await vi.waitFor(() => expect(wrapper.find(".upload-probe").exists()).toBe(false));
  });
});
