import { defineProduct } from "@nuxvel/nuxt/server/billing";

export const courseProduct = defineProduct({ lookupKey: "course_once", mode: "payment" })
