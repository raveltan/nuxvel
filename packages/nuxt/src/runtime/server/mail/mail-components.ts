import { type AnchorHTMLAttributes, type FunctionalComponent, type VNode, h } from "vue";
import MailLayout from "./mail-layout";

type Slots = { default?: () => VNode[] };

type Attributes<Name extends string> = { [Key in Name]?: string };

type Padding = "padding" | "padding-top" | "padding-right" | "padding-bottom" | "padding-left";
type Border = "border" | "border-top" | "border-right" | "border-bottom" | "border-left";
type Background =
  | "background-color"
  | "background-url"
  | "background-repeat"
  | "background-size"
  | "background-position"
  | "background-position-x"
  | "background-position-y";
type Font =
  | "font-family"
  | "font-size"
  | "font-style"
  | "font-weight"
  | "letter-spacing"
  | "line-height"
  | "text-decoration"
  | "text-transform";

/** The MJML attributes of `<mjml>`, set through {@link mailComponents.EHtml}. */
export type HtmlAttributes = Attributes<"lang" | "dir" | "owa">;
/** The MJML attributes of `<mj-body>`, set through {@link mailComponents.EBody}. */
export type BodyAttributes = Attributes<"width" | "background-color">;
/** The MJML attributes of `<mj-wrapper>` and `<mj-section>`, set through {@link mailComponents.EContainer} and {@link mailComponents.ESection}. */
export type SectionAttributes = Attributes<
  Padding | Border | Background | "border-radius" | "direction" | "full-width" | "gutter" | "text-align" | "text-padding"
>;
/** The MJML attributes of `<mj-group>`, set through {@link mailComponents.ERow}. */
export type RowAttributes = Attributes<"background-color" | "direction" | "vertical-align" | "width">;
/** The MJML attributes of `<mj-column>`, set through {@link mailComponents.EColumn}. */
export type ColumnAttributes = Attributes<
  | Padding
  | Border
  | "background-color"
  | "border-radius"
  | "direction"
  | "inner-background-color"
  | "inner-border"
  | "inner-border-radius"
  | "vertical-align"
  | "width"
>;
/** The MJML attributes of `<mj-text>`, set through {@link mailComponents.EText} and {@link mailComponents.EHeading}. */
export type TextAttributes = Attributes<
  Padding | Font | "align" | "color" | "background-color" | "container-background-color" | "height" | "vertical-align"
>;
/** The MJML attributes of `<mj-button>`, set through {@link mailComponents.EButton}. */
export type ButtonAttributes = Attributes<
  | Padding
  | Border
  | Font
  | "href"
  | "rel"
  | "target"
  | "title"
  | "name"
  | "align"
  | "text-align"
  | "vertical-align"
  | "color"
  | "background-color"
  | "container-background-color"
  | "border-radius"
  | "inner-padding"
  | "height"
  | "width"
>;
/** The MJML attributes of `<mj-image>`, set through {@link mailComponents.EImg}. */
export type ImgAttributes = Attributes<
  | Padding
  | Border
  | "src"
  | "srcset"
  | "sizes"
  | "alt"
  | "title"
  | "href"
  | "rel"
  | "target"
  | "name"
  | "align"
  | "border-radius"
  | "container-background-color"
  | "fluid-on-mobile"
  | "width"
  | "height"
  | "max-height"
  | "font-size"
  | "usemap"
>;
/** The MJML attributes of `<mj-divider>`, set through {@link mailComponents.EHr}. */
export type HrAttributes = Attributes<
  Padding | "align" | "border-color" | "border-style" | "border-width" | "container-background-color" | "width"
>;
/** The props of {@link mailComponents.EHeading}: the `<mj-text>` attributes and the heading level. */
export type HeadingAttributes = TextAttributes & { as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" };

function mjmlTag<Props extends object>(tag: string): FunctionalComponent<Props, {}, Slots> {
  const component: FunctionalComponent<Props, {}, Slots> = (props, { slots }) => h(tag, props, slots.default?.());
  component.inheritAttrs = false;

  return component;
}

const headingStyle = "margin:0;font-size:inherit;font-weight:inherit;line-height:inherit;color:inherit";

const heading: FunctionalComponent<HeadingAttributes, {}, Slots> = ({ as = "h1", ...attributes }, { slots }) =>
  h("mj-text", { "font-size": "24px", "line-height": "32px", "font-weight": "700", ...attributes }, [
    h(as, { style: headingStyle }, slots.default?.()),
  ]);
heading.inheritAttrs = false;

const link: FunctionalComponent<AnchorHTMLAttributes, {}, Slots> = (props, { slots }) => h("a", props, slots.default?.());
link.inheritAttrs = false;

/**
 * The components a mail template under `server/mail/` uses without
 * importing them. Each `E` component renders one MJML tag, and
 * `renderEmail` turns the MJML into HTML that email clients show,
 * Outlook included. Style them with MJML attributes, for example
 * `<EText font-size="14px" color="#6b7280">`.
 */
export const mailComponents = {
  /** The document root, `<mjml>`. {@link MailLayout} renders it for you. */
  EHtml: mjmlTag<HtmlAttributes>("mjml"),
  /** The document head, `<mj-head>`. Holds {@link mailComponents.EPreview}. */
  EHead: mjmlTag<object>("mj-head"),
  /** The hidden line that the inbox shows after the subject, `<mj-preview>`. Goes in {@link mailComponents.EHead}. */
  EPreview: mjmlTag<object>("mj-preview"),
  /** The document body, `<mj-body>`. Holds {@link mailComponents.EContainer} and {@link mailComponents.ESection}. */
  EBody: mjmlTag<BodyAttributes>("mj-body"),
  /** A box around sections that shares a background and a border, `<mj-wrapper>`. */
  EContainer: mjmlTag<SectionAttributes>("mj-wrapper"),
  /** A row of the layout, `<mj-section>`. Holds {@link mailComponents.EColumn} and {@link mailComponents.ERow}. */
  ESection: mjmlTag<SectionAttributes>("mj-section"),
  /** A group of columns that stays side by side on phones, `<mj-group>`. */
  ERow: mjmlTag<RowAttributes>("mj-group"),
  /** A column of a section, `<mj-column>`. Columns stack on phones. Holds the content components. */
  EColumn: mjmlTag<ColumnAttributes>("mj-column"),
  /** A paragraph, `<mj-text>`. Its content may hold HTML, such as {@link mailComponents.ELink}. */
  EText: mjmlTag<TextAttributes>("mj-text"),
  /** A heading: an `<mj-text>` at 24px bold around an `<h1>`, or the level that `as` sets. */
  EHeading: heading,
  /** A link that looks like a button, `<mj-button>`, with a VML fallback for Outlook. */
  EButton: mjmlTag<ButtonAttributes>("mj-button"),
  /** An image, `<mj-image>`. */
  EImg: mjmlTag<ImgAttributes>("mj-image"),
  /** A horizontal line, `<mj-divider>`. */
  EHr: mjmlTag<HrAttributes>("mj-divider"),
  /** A plain link, `<a>`. Put it inside an {@link mailComponents.EText}. */
  ELink: link,
  MailLayout,
};
