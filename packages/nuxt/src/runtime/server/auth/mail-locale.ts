import type { User } from "better-auth";
import { currentLocale } from "../i18n/current-locale";

export function mailLocale(user: Pick<User, "email"> & { locale?: string | null }): string {
  return user.locale || currentLocale();
}
