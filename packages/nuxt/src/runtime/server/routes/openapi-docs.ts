import { defineEventHandler, setResponseHeader } from "h3";
import { useNuxvelConfig } from "../utils/config";

const SCALAR_SCRIPT = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.0/dist/browser/standalone.js";
const SCALAR_INTEGRITY = "sha384-OPr81V05YKGVtMFR7bgn6teWINJ+Qb5LIgvuAi2xv2C/5Y1/PcjZ0DrvpMdP39ix";

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  `script-src ${SCALAR_SCRIPT}`,
  "style-src 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export default defineEventHandler((event) => {
  const { api } = useNuxvelConfig();
  const title = escapeAttribute(api?.openapi?.title ?? "API");
  const url = escapeAttribute(`${api?.restPrefix}/openapi.json`);

  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  setResponseHeader(event, "content-security-policy", CONTENT_SECURITY_POLICY);

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body>
<script id="api-reference" type="application/json" data-url="${url}" data-configuration="{&quot;withDefaultFonts&quot;:false}"></script>
<script src="${SCALAR_SCRIPT}" integrity="${SCALAR_INTEGRITY}" crossorigin="anonymous"></script>
</body>
</html>
`;
});
