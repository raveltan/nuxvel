import { ValidationFailedError } from "../errors/taxonomy";
import { findMail } from "./registry";

export async function renderMail(name: string, input: unknown, locale?: string) {
  const mail = findMail(name);

  if (!mail) throw new Error(`No mail is named "${name}"`);

  const result = await mail.input.safeParseAsync(input);

  if (!result.success) throw new ValidationFailedError(result.error);

  return { subject: mail.subject(result.data, locale), ...(await mail.render(result.data, locale)) };
}
