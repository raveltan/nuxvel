import { type FunctionalComponent, type VNode, h, inject } from "vue";
import { translateKey } from "../i18n/translator";
import { useNuxvelConfig } from "../utils/config";

function siteName(from: string) {
  const displayName = /^\s*"?([^"<]*?)"?\s*</.exec(from)?.[1];

  return displayName || from.slice(from.lastIndexOf("@") + 1).replace(/>\s*$/, "");
}

const fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/**
 * The default frame for a mail template: a centred white card with the
 * site name above your content and a footer below it.
 *
 * Registered for Vue templates under `server/mail/` only, next to the
 * `E`-prefixed MJML components. Its slot is the content of one
 * `<mj-column>`, so it holds `<EHeading>`, `<EText>`, `<EButton>`,
 * `<EImg>` and `<EHr>`, not `<ESection>`. It sets their default font,
 * size and color, which a template overrides with MJML attributes. The
 * site name is `nuxvel.seo.siteName`; without it, the display name of
 * `nuxvel.mail.from` (`"My Blog"` for `My Blog <hello@example.com>`), or
 * its domain when it has none. It renders `<EHtml>`, `<EHead>` and
 * `<EBody>` itself, so a template that wraps its content in it needs
 * none of them.
 *
 * @param preview The hidden line that the inbox shows after the subject.
 *
 * @example
 * ```vue
 * <template>
 *   <MailLayout :preview="`Welcome, ${name}`">
 *     <EHeading>Welcome, {{ name }}!</EHeading>
 *     <EButton href="https://example.com" background-color="#4f46e5">Open</EButton>
 *   </MailLayout>
 * </template>
 * ```
 */
const mailLayout: FunctionalComponent<{ preview?: string }, {}, { default?: () => VNode[] }> = (props, { slots }) => {
  const config = useNuxvelConfig();
  const name = config.siteName || siteName(config.mail?.from ?? "");
  const t = inject(translateKey);

  return h("mjml", null, [
    h("mj-head", null, [
      props.preview ? h("mj-preview", null, props.preview) : null,
      h("mj-attributes", null, [
        h("mj-all", { "font-family": fontFamily }),
        h("mj-text", { "font-size": "16px", "line-height": "24px", color: "#374151", padding: "8px 0" }),
        h("mj-button", {
          "font-size": "16px",
          "font-weight": "600",
          color: "#ffffff",
          "background-color": "#111827",
          "border-radius": "6px",
          "inner-padding": "12px 20px",
          padding: "16px 0",
          align: "left",
        }),
      ]),
    ]),
    h("mj-body", { "background-color": "#f3f4f6" }, [
      h("mj-wrapper", { padding: "32px 16px" }, [
        h("mj-section", { "background-color": "#ffffff", "border-radius": "8px", padding: "24px 32px" }, [
          h("mj-column", null, [
            h("mj-text", { "font-size": "18px", "font-weight": "700", color: "#111827" }, name),
            slots.default?.(),
            h("mj-divider", { "border-width": "1px", "border-color": "#e5e7eb", padding: "24px 0" }),
            h("mj-text", { "font-size": "12px", "line-height": "16px", color: "#6b7280" }, t ? t("nuxvel.mail.sentBy", { name }) : `Sent by ${name}.`),
          ]),
        ]),
      ]),
    ]),
  ]);
};
mailLayout.inheritAttrs = false;

export default mailLayout;
