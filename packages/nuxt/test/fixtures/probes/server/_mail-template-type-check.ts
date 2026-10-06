import { z } from "zod";

type IsAny<T> = 0 extends 1 & T ? true : false;

export const templateNameIsTyped: IsAny<MailTemplateName> extends true
  ? never
  : string extends MailTemplateName
    ? never
    : "Welcome" extends MailTemplateName
      ? true
      : never = true;

export const templatePropsAreTyped: IsAny<MailTemplateProps<"Welcome">> extends true
  ? never
  : MailTemplateProps<"Welcome"> extends { name: string }
    ? { name: number } extends MailTemplateProps<"Welcome">
      ? never
      : true
    : never = true;

export const wrongPropType = defineMail({
  input: z.object({ to: z.email(), name: z.number() }),
  subject: () => "Welcome",
  // @ts-expect-error Welcome's name is a string
  template: "Welcome",
});

export const missingProp = defineMail({
  input: z.object({ to: z.email() }),
  subject: () => "Welcome",
  // @ts-expect-error Welcome needs a name
  template: "Welcome",
});

export const unknownTemplate = defineMail({
  input: z.object({ to: z.email(), name: z.string() }),
  subject: () => "Welcome",
  // @ts-expect-error no template is named Goodbye
  template: "Goodbye",
});

const numberName = z.object({ to: z.email(), name: z.number() });

type NumberNameTemplate = Extract<Parameters<typeof defineMail<typeof numberName>>[0], { template: unknown }>["template"];

export const misfitNamesTheProblem: [NumberNameTemplate] extends [never]
  ? never
  : [NumberNameTemplate] extends ["no mail template takes this input"]
    ? true
    : never = true;
