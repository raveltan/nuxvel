export const FLASH_COOKIE = "nuxvel-flash";

const FLASH_TYPES = ["success", "error", "info", "warning"] as const;

/** The kind of a flash message. With Nuxt UI, it is the toast colour. */
export type FlashType = (typeof FLASH_TYPES)[number];

/** A message that {@link flash} stores for the next page load, as {@link useFlash} returns it. */
export interface FlashMessage {
  message: string;
  type: FlashType;
}

function isFlashMessage(value: unknown): value is FlashMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string" &&
    "type" in value &&
    FLASH_TYPES.some((type) => type === value.type)
  );
}

export function parseFlashMessages(raw: string | undefined): FlashMessage[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");

    return Array.isArray(value) ? value.filter(isFlashMessage) : [];
  } catch {
    return [];
  }
}
