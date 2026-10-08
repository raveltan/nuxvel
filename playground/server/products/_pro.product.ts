import { defineProduct } from "@nuxvel/nuxt/server/billing";

export const proProduct = defineProduct({ lookupKey: "pro_monthly", mode: "subscription" })
