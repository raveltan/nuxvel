const ESCAPED: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: unknown) {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPED[character] ?? character);
}

export function testPage(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>A page of nuxvel's in-memory Stripe, in place of Stripe's, in a test build.</p>
${body}
</main>
</body>
</html>`;
}
