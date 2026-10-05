import { defineFactory, sequence } from "@nuxvel/nuxt/factories";
import { userTable } from "~~/server/database/schema/auth.schema";

type IsAny<T> = 0 extends 1 & T ? true : false;

export const derivedFactory = defineFactory(userTable, {
  name: "Ada Lovelace",
  email: sequence((n, user) => {
    const typed: IsAny<typeof user> extends true ? never : string = user.name;
    return `${typed}-${n}@example.com`;
  }),
  image: (user) => {
    const typed: IsAny<typeof user> extends true ? never : string = user.email;
    return typed;
  },
});

// @ts-expect-error a derived field returns the column's type
export const wrongDerived = defineFactory(userTable, { name: (user) => user.emailVerified });
