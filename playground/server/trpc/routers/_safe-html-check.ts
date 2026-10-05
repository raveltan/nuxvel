export default {
  sample: publicProcedure.query(() =>
    sanitizeHtml('<p onclick="steal()">Hello <strong>world</strong></p><script>alert(1)</script>'),
  ),
};
