import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, expectNotStored, guest } from "@nuxvel/nuxt/testing";
import { beforeAll, describe, it } from "vitest";
import { ensureBucket, putObject, storedObject } from "./helpers/storage";
import { setupPlayground } from "./helpers/playground";
import { TEST_STORAGE_BUCKET } from "./setup/constants";

const MALICIOUS_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">',
  "<script>alert(2)</script>",
  '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(3)"/></body></foreignObject>',
  '<a href="javascript:alert(4)"><rect width="10" height="10" fill="red"/></a>',
  "</svg>",
].join("");

async function uploadSvg(upload: string) {
  const body = new TextEncoder().encode(MALICIOUS_SVG);
  const presigned = await guest().$fetch<{ url: string; key: string; headers: Record<string, string> }>(
    `/api/uploads/${upload}`,
    { method: "POST", body: { type: "image/svg+xml", size: body.byteLength } },
  );

  await globalThis.fetch(presigned.url, { method: "PUT", headers: presigned.headers, body });

  const to = `svg-test/${randomUUID()}`;

  await guest().$fetch("/api/_promote-svg-check", { method: "POST", body: { upload, key: presigned.key, to } });

  return { tmpKey: presigned.key, to };
}

async function promoteSvg(upload: string, svg: string) {
  const tmpKey = `tmp/${upload}/${randomUUID()}`;

  await putObject(TEST_STORAGE_BUCKET, tmpKey, new TextEncoder().encode(svg), "image/svg+xml");

  const to = `svg-test/${randomUUID()}`;
  const response = await guest().fetch("/api/_promote-svg-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ upload, key: tmpKey, to }),
  });

  return { response, tmpKey, to };
}

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">';
const LIMITS_MESSAGE = "The SVG file must be at most 262144 bytes, with at most 1000 elements and at most 4000000 pixels";

async function expectRefused({ response, tmpKey }: Awaited<ReturnType<typeof promoteSvg>>) {
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ data: { code: "VALIDATION_ERROR", fields: { key: [LIMITS_MESSAGE] } } });
  await expectNotStored(tmpKey);
}

describe("SVG uploads", async () => {
  await setupPlayground();

  beforeAll(() => ensureBucket(TEST_STORAGE_BUCKET));

  it("refuses an SVG by default, even when allowedTypes lists it", async () => {
    const response = await guest().fetch("/api/uploads/_svg-rejected", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "image/svg+xml", size: 512 }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ data: { fields: { type: ["Must be one of image/png"] } } });
  });

  it("stores a rasterized SVG as a PNG at the promoted key", async () => {
    const { tmpKey, to } = await uploadSvg("_svg-rasterized");
    const stored = await storedObject(TEST_STORAGE_BUCKET, to);

    expect(stored.contentType).toBe("image/png");
    expect(stored.body.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await expectNotStored(tmpKey);
  });

  it("stores a sanitized SVG without scripts, handlers, links or foreignObject", async () => {
    const { to } = await uploadSvg("_svg-sanitized");
    const stored = await storedObject(TEST_STORAGE_BUCKET, to);

    expect(stored.contentType).toBe("image/svg+xml");
    expect(stored.body.toString()).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"></rect></svg>',
    );
  });

  it.for(["_svg-sanitized", "_svg-rasterized"])("refuses and deletes an SVG larger than 256 KB (%s)", async (upload) => {
    await expectRefused(await promoteSvg(upload, `${SVG_OPEN}<desc>${"x".repeat(300_000)}</desc></svg>`));
  });

  it.for(["_svg-sanitized", "_svg-rasterized"])("refuses and deletes an SVG with more than 1000 elements (%s)", async (upload) => {
    await expectRefused(
      await promoteSvg(upload, `${SVG_OPEN}${"<g>".repeat(5000)}<rect width="1" height="1"/>${"</g>".repeat(5000)}</svg>`),
    );
  });

  it("refuses and deletes an SVG that rasterizes to more than 4 megapixels", async () => {
    await expectRefused(
      await promoteSvg("_svg-rasterized", '<svg xmlns="http://www.w3.org/2000/svg" width="2001" height="2000"><rect width="10" height="10"/></svg>'),
    );
  });

  it("rasterizes an SVG without its filters or dashes", async () => {
    const { response, to } = await promoteSvg(
      "_svg-rasterized",
      `${SVG_OPEN}<filter id="f"><feFlood flood-color="blue"/></filter>` +
        '<rect width="10" height="5" fill="red" filter="url(#f)"/>' +
        '<line x1="0" y1="7.5" x2="10" y2="7.5" stroke="red" stroke-width="5" stroke-dasharray="4 4"/></svg>',
    );

    expect(response.status).toBe(200);

    const { data, info } = await sharp((await storedObject(TEST_STORAGE_BUCKET, to)).body)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];

    expect(pixel(2, 2)).toEqual([255, 0, 0, 255]);
    expect(pixel(6, 7)).toEqual([255, 0, 0, 255]);
  });
});
