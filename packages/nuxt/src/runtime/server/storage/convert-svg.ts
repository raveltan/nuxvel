import sanitize from "sanitize-html";

const SVG_TAGS = [
  "svg", "g", "defs", "title", "desc", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "linearGradient", "radialGradient", "stop", "clipPath", "mask",
];

const SVG_ATTRIBUTES = [
  "xmlns", "version", "viewBox", "preserveAspectRatio", "width", "height", "id", "class", "transform",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "offset",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap",
  "stroke-linejoin", "stroke-dasharray", "opacity", "clip-path", "clip-rule", "mask",
  "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
  "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline",
];

const MAX_BYTES = 256 * 1024;
const MAX_ELEMENTS = 1000;
const MAX_PIXELS = 4_000_000;
const RASTER_ATTRIBUTES = SVG_ATTRIBUTES.filter((name) => name !== "stroke-dasharray");

export const SVG_LIMITS_MESSAGE = `The SVG file must be at most ${MAX_BYTES} bytes, with at most ${MAX_ELEMENTS} elements and at most ${MAX_PIXELS} pixels`;

function cleanSvg(svg: Uint8Array, attributes: string[]) {
  if (svg.byteLength > MAX_BYTES) return undefined;

  let elements = 0;

  try {
    return sanitize(new TextDecoder().decode(svg), {
      allowedTags: SVG_TAGS,
      allowedAttributes: { "*": attributes },
      parser: { xmlMode: true },
      onOpenTag: () => {
        elements += 1;
        if (elements > MAX_ELEMENTS) throw new RangeError(SVG_LIMITS_MESSAGE);
      },
    });
  } catch {
    return undefined;
  }
}

export async function convertSvg(svg: Uint8Array, handling: "rasterize" | "sanitize") {
  const cleaned = cleanSvg(svg, handling === "rasterize" ? RASTER_ATTRIBUTES : SVG_ATTRIBUTES);

  if (cleaned === undefined) return undefined;
  if (handling === "sanitize") return { body: cleaned, contentType: "image/svg+xml" };

  const { default: sharp } = await import("sharp");
  const png = await sharp(Buffer.from(cleaned), { limitInputPixels: MAX_PIXELS })
    .png()
    .toBuffer()
    .catch(() => undefined);

  return png === undefined ? undefined : { body: png, contentType: "image/png" };
}
