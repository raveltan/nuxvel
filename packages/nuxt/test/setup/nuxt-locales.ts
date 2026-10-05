import { registerEndpoint } from "@nuxt/test-utils/runtime";
import nuxvel from "../../src/runtime/locales/en.json";
import playground from "../../../../playground/locales/en.json";

// the nuxt environment runs no Nitro, so the translation payload nuxt-i18n-micro fetches on start is served here
registerEndpoint("/_locales/index/en/data.json", () => ({ ...playground, ...nuxvel }));
