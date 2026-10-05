export default defineEventHandler(() => {
  const parsed = richTextProbeInput.parse({
    body: '<p>See <a href="javascript:alert(1)">this</a> and <a href="https://example.com" rel="follow">that</a></p>',
  });
  const tooLong = richTextProbeInput.safeParse({ body: "x".repeat(201) });

  return {
    body: parsed.body,
    tooLong: tooLong.success ? null : toValidationError(tooLong.error).fields,
  };
});
