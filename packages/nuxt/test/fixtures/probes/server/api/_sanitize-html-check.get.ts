const HOSTILE = [
  '<p onclick="steal()">Hello <strong>world</strong></p>',
  "<script>alert(1)</script>",
  '<img src="x" onerror="alert(1)">',
  '<a href="javascript:alert(1)">bad</a> <a href="https://example.com" style="color:red">good</a>',
  "<h2>Title</h2>",
].join("");

export default defineEventHandler(() => ({
  basic: sanitizeHtml(HOSTILE),
  rich: sanitizeHtml(HOSTILE, { profile: "rich" }),
}));
