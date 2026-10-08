import { publicProcedure } from "@nuxvel/nuxt/server/api";
import { sanitizeHtml } from "@nuxvel/nuxt/shared/html";

export default {
  sample: publicProcedure.query(() =>
    sanitizeHtml('<p onclick="steal()">Hello <strong>world</strong></p><script>alert(1)</script>'),
  ),
};
