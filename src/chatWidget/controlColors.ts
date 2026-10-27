/*
 * Readable controls on any colours a site sets (WCAG 1.4.3 and 1.4.11).
 *
 * The widget draws controls on coloured surfaces: link buttons on the answer
 * bubble, suggestion chips on the message list, the send button in the input
 * field, the AI notice in the input bar and "Try again" in the error message.
 * A site's colours can make a control vanish, for example a button in the
 * same red as the bubble behind it. For each control this module checks:
 * - the fill, or the outline, against the surface: at least 3:1,
 * - the label on the fill: at least 4.5:1 for text, 3:1 for an icon,
 * - links on the bubble and the AI notice on the input bar: at least 4.5:1.
 * A send button in the field's own colour is an icon-only button: only its
 * icon is checked, on the field.
 * A colour that passes stays as it is. A colour that fails gets a fallback:
 * the site's link colour if it passes, else the site's own colour made just
 * dark or light enough while its label still reads, else white or black.
 * A theme colour falls back to the theme's link colour, else white or black.
 * The label then gets a colour that reaches 4.5:1 on the new fill: its own
 * colour, the surface colour, or white or black.
 *
 * Without button_color, the filled link buttons follow the site's own
 * colours: its link colour, else its send button, else its visitor bubbles.
 * The first that reaches 3:1 on the bubble wins, as it is or a little darker
 * or lighter (siteFilled). Only where none does, the theme accent, the theme
 * fallback or white or black fill the button.
 *
 * The header icon sits on the header without a plate. Only where its colour
 * would vanish on the header (below 3:1), it gets a plate: a shade of the
 * header colour on which the icon reaches 3:1.
 *
 * The checkout card sits on the answer bubble. On a site's own bubble colour
 * it is a lighter shade of that colour (cardSurface). Its button takes the
 * fill of the filled link buttons, checked again on the card.
 */
import { BLACK, WHITE, Rgb, contrastRatio, mix, paintOver, parseColor, toHex } from "./colorContrast";

export type ThemeName = "default" | "dark" | "ocean" | "aurora" | "punku-ai-bookingkit" | "swarovski";

/** A fill or an outline against the surface behind it (WCAG 1.4.11). */
export const BOUNDARY_MIN = 3;
/** Text on its background (WCAG 1.4.3). */
export const TEXT_MIN = 4.5;
/** An icon on its background (WCAG 1.4.11). */
export const ICON_MIN = 3;

/**
 * The stylesheet colours that the checks need, per theme. Keep them in step
 * with the widget stylesheet (src/chatWidget/index.tsx). `null` is a colour
 * the widget cannot measure, such as a gradient: its controls are not changed.
 */
type ThemeColors = {
  bubble: string;
  bubbleText: string;
  list: string;
  field: string;
  /** The input bar behind a field that is not opaque. */
  fieldBackdrop: string;
  /** The window behind an input bar that is not opaque. null: the window has no colour. */
  window: string | null;
  accent: string;
  onAccent: string;
  /**
   * The dark themes: their mid accent, with white text, for a fill on a
   * light site colour (--cl-accent-on-light). Their accent is light.
   */
  accentOnLight?: string;
  link: string;
  send: string | null;
  sendIcon: string;
  chipInk: string;
  chipLine: string;
  /** null: the chip is transparent and the list shows through. */
  chipBg: string | null;
  errorBg: string;
  errorInk: string;
  /** The AI notice in the input bar (--cl-muted). */
  muted: string;
  /** The header background: one colour, or each stop of a gradient. */
  header: string[];
  /** The header icons and title without button_color. */
  headerInk: string;
  /** The checkout card on the answer bubble (--cl-card-bg) and its venue line (--cl-card-meta). */
  card: string;
  cardMeta: string;
};

const LIGHT_BASE: ThemeColors = {
  bubble: "#e5e7eb",
  bubbleText: "#1f2937",
  list: "#f9fafb",
  field: "#ffffff",
  fieldBackdrop: "#ffffff",
  window: null,
  accent: "#2563eb",
  onAccent: "#ffffff",
  link: "#1d4ed8",
  send: "#3b82f6",
  sendIcon: "#ffffff",
  chipInk: "#1d4ed8",
  chipLine: "#1d4ed8",
  chipBg: "#ffffff",
  errorBg: "#fef2f2",
  errorInk: "#991b1b",
  muted: "#64748b",
  // The base header of the stylesheet. Only the default theme makes it white.
  header: ["#1a1a1a"],
  headerInk: "#ffffff",
  // A white card on the grey answer bubble.
  card: "#ffffff",
  cardMeta: "#4b5563",
};

export const THEME_COLORS: Record<ThemeName, ThemeColors> = {
  default: {
    ...LIGHT_BASE,
    bubble: "#ffffff",
    bubbleText: "#1e293b",
    list: "#f8fafc",
    window: "#ffffff",
    accent: "#0969da",
    send: "#0969da",
    header: ["#ffffff"],
    headerInk: "#0f172a",
    card: "#f8fafc",
    cardMeta: "#475569",
  },
  dark: {
    bubble: "#1e293b",
    bubbleText: "#e2e8f0",
    list: "#030712",
    field: "#111a2e",
    fieldBackdrop: "#0f172a",
    window: "#030712",
    // Link buttons in the light link colour with dark text.
    accent: "#a5b4fc",
    onAccent: "#1e1b4b",
    accentOnLight: "#5558e8",
    link: "#a5b4fc",
    send: "#5558e8",
    sendIcon: "#ffffff",
    chipInk: "#c7d2fe",
    chipLine: "#818cf8",
    chipBg: null,
    errorBg: "rgba(127, 29, 29, 0.32)",
    errorInk: "#fecaca",
    muted: "#94a3b8",
    header: ["#0f172a"],
    headerInk: "#ffffff",
    card: "#273449",
    cardMeta: "#94a3b8",
  },
  ocean: {
    bubble: "#1e293b",
    bubbleText: "#f1f5f9",
    list: "#0f172a",
    field: "#111c30",
    fieldBackdrop: "#0f172a",
    window: "#0f172a",
    accent: "#7dd3fc",
    onAccent: "#082f49",
    accentOnLight: "#0369a1",
    link: "#7dd3fc",
    send: "#0277b6",
    sendIcon: "#ffffff",
    chipInk: "#bae6fd",
    chipLine: "#38bdf8",
    chipBg: null,
    errorBg: "rgba(127, 29, 29, 0.32)",
    errorInk: "#fecaca",
    muted: "#94a3b8",
    header: ["#0c4a6e", "#075985"],
    headerInk: "#ffffff",
    card: "#1f3550",
    cardMeta: "#9fb4cc",
  },
  aurora: {
    bubble: "rgba(76, 29, 149, 0.5)",
    bubbleText: "#ede9fe",
    list: "#2e1065",
    field: "rgba(46, 16, 101, 0.55)",
    fieldBackdrop: "#1e1b4b",
    window: "#2e1065",
    accent: "#f0abfc",
    onAccent: "#3b0764",
    accentOnLight: "#7c3aed",
    link: "#f0abfc",
    // A gradient (#7c3aed to #db2777).
    send: null,
    sendIcon: "#ffffff",
    chipInk: "#f5d0fe",
    chipLine: "#e879f9",
    chipBg: null,
    errorBg: "rgba(127, 29, 29, 0.35)",
    errorInk: "#fecaca",
    muted: "#c4b5fd",
    header: ["#4c1d95", "#7c3aed", "#db2777"],
    headerInk: "#ffffff",
    card: "rgba(255, 255, 255, 0.07)",
    cardMeta: "#c4b5fd",
  },
  "punku-ai-bookingkit": { ...LIGHT_BASE, send: "#2563eb" },
  // Links in the blue of the swarovski-widget branch (.theme-swarovski in the stylesheet).
  swarovski: { ...LIGHT_BASE, link: "#0969da" },
};

/** The props that set colours of the controls. */
export type ControlColorProps = {
  theme?: string;
  button_color?: string;
  button_text_color?: string;
  link_color?: string;
  user_message_color?: string;
  user_message_style?: React.CSSProperties;
  bot_message_color?: string;
  bot_message_text_color?: string;
  bot_message_style?: React.CSSProperties;
  background_color?: string;
  input_style?: React.CSSProperties;
  input_container_style?: React.CSSProperties;
  send_button_style?: React.CSSProperties;
  send_icon_style?: React.CSSProperties;
  error_message_style?: React.CSSProperties;
};

/**
 * The colours to apply. A key is present only where a colour changes, and
 * the card keys where a site's answer colour makes the card.
 */
export type GuardedColors = {
  linkButtonFill?: string;
  linkButtonLabel?: string;
  /** Inline and outlined links: the site's link colour, made readable. */
  link?: string;
  /** Without link_color: links take the bubble's text colour. */
  linksTakeTextColor?: boolean;
  chipLine?: string;
  chipInk?: string;
  sendFill?: string;
  sendIcon?: string;
  retryLabel?: string;
  noticeInk?: string;
  /** A plate behind the header icon, only where the icon would vanish on the header. */
  headerIconPlate?: string;
  /**
   * With button_color: the subtitle shows button_text_color at full opacity,
   * only where the stylesheet's 85% would fall below 4.5:1 on the header.
   */
  subtitleOpaque?: boolean;
  /** The checkout card where it is not the theme's card, and its venue line where it is not the theme's colour. */
  cardBg?: string;
  cardMeta?: string;
  /**
   * "custom": the card is not the theme's card (a site's answer colour, or
   * a site's text colour that reads worse on the theme's card). "image": the
   * answer is a gradient or an image.
   */
  cardSurface?: "custom" | "image";
  /** The checkout card button, only where the link button fill would vanish on the card. */
  cardButtonFill?: string;
  cardButtonLabel?: string;
};

/** One measured pair: a control's colour and the colour behind it. */
export type ControlContrast = {
  control: string;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
};

const contrast = (a: Rgb, b: Rgb) => contrastRatio(a, b);

/** An opaque colour: an alpha colour is painted on `backdrop`. null: cannot be read. */
function resolve(value: unknown, backdrop?: Rgb | null): Rgb | null {
  const color = parseColor(value);
  if (!color) return null;
  if (color.alpha >= 0.999) return color.rgb;
  return backdrop ? paintOver(color.rgb, color.alpha, backdrop) : null;
}

/** White or black, whichever reads better on `surface`. */
function blackOrWhite(surface: Rgb): Rgb {
  return contrast(WHITE, surface) >= contrast(BLACK, surface) ? WHITE : BLACK;
}

/** The first label colour that reaches `minimum` on `fill`, preferring `preferred`. */
function pickLabel(fill: Rgb, minimum: number, preferred: Rgb | null, surface: Rgb | null): Rgb {
  for (const candidate of [preferred, surface]) {
    if (candidate && contrast(candidate, fill) >= minimum) return candidate;
  }
  return blackOrWhite(fill);
}

/**
 * The smallest move of `color` toward black or white that `accept` takes.
 * Moves in 5% steps, at most `limit` of the way.
 */
function nudge(color: Rgb, surface: Rgb, accept: (candidate: Rgb) => boolean, limit = 1): Rgb | null {
  // First the direction that raises the contrast with the surface.
  const targets = contrast(BLACK, surface) >= contrast(WHITE, surface) ? [BLACK, WHITE] : [WHITE, BLACK];
  for (let step = 1; step <= Math.round(limit * 20); step += 1) {
    for (const target of targets) {
      const candidate = mix(color, target, step / 20);
      if (accept(candidate)) return candidate;
    }
  }
  return null;
}

type Filled = { fill: Rgb; label: Rgb };

/**
 * A filled control on `surface`. `own` is true when the fill is a site
 * colour, which may be nudged; a theme colour falls back to `themeFallback`.
 */
export function guardFilled(options: {
  fill: Rgb;
  label: Rgb;
  /** A translucent label shows the fill through: it is measured on each fill. */
  labelAlpha?: number;
  surface: Rgb;
  labelMin: number;
  own: boolean;
  linkColor?: Rgb | null;
  themeFallback?: Rgb | null;
}): Filled {
  const { fill, label, labelAlpha = 1, surface, labelMin, own, linkColor, themeFallback } = options;
  // The label as the browser paints it on a fill. The result is always opaque.
  const labelOn = (next: Rgb) => (labelAlpha >= 0.999 ? label : paintOver(label, labelAlpha, next));
  if (contrast(fill, surface) >= BOUNDARY_MIN) {
    const shown = labelOn(fill);
    return { fill, label: contrast(shown, fill) >= labelMin ? shown : pickLabel(fill, labelMin, shown, surface) };
  }
  const withLabel = (next: Rgb): Filled => ({ fill: next, label: pickLabel(next, labelMin, labelOn(next), surface) });
  if (linkColor && contrast(linkColor, surface) >= BOUNDARY_MIN) return withLabel(linkColor);
  if (own) {
    // A small move of the site colour, if its label then still reads. A
    // larger move gives a dull in-between colour: white or black looks better.
    const keepsLabel = nudge(fill, surface, (candidate) =>
      contrast(candidate, surface) >= BOUNDARY_MIN && contrast(labelOn(candidate), candidate) >= labelMin, 0.6);
    if (keepsLabel) return { fill: keepsLabel, label: labelOn(keepsLabel) };
  } else if (themeFallback && contrast(themeFallback, surface) >= BOUNDARY_MIN) {
    return withLabel(themeFallback);
  }
  return withLabel(blackOrWhite(surface));
}

/** How far a site colour may move toward black or white to fill a link button: a little. */
const SITE_NUDGE = 0.25;

/**
 * A filled link button in a site colour on `surface`, or null where the
 * colour does not reach 3:1 there, even a little darker or lighter. First the
 * colour as it is with `label`, then the smallest move that keeps `label`,
 * then the colour (as it is or a little moved) with a label that reads.
 */
export function siteFilled(color: Rgb, label: { rgb: Rgb; alpha: number }, surface: Rgb, labelMin: number): Filled | null {
  const labelOn = (fill: Rgb) => (label.alpha >= 0.999 ? label.rgb : paintOver(label.rgb, label.alpha, fill));
  const visible = (fill: Rgb) => contrast(fill, surface) >= BOUNDARY_MIN;
  const keepsLabel = (fill: Rgb) => visible(fill) && contrast(labelOn(fill), fill) >= labelMin;
  const withOwnLabel = keepsLabel(color) ? color : nudge(color, surface, keepsLabel, SITE_NUDGE);
  if (withOwnLabel) return { fill: withOwnLabel, label: labelOn(withOwnLabel) };
  const fill = visible(color) ? color : nudge(color, surface, visible, SITE_NUDGE);
  return fill ? { fill, label: pickLabel(fill, labelMin, labelOn(fill), surface) } : null;
}

/** Text in a site colour on `surface`: kept from 4.5:1, else moved just enough to read. */
export function guardOwnText(color: Rgb, surface: Rgb, fallback: Rgb | null): Rgb {
  if (contrast(color, surface) >= TEXT_MIN) return color;
  const moved = nudge(color, surface, (candidate) => contrast(candidate, surface) >= TEXT_MIN);
  if (moved) return moved;
  if (fallback && contrast(fallback, surface) >= TEXT_MIN) return fallback;
  return blackOrWhite(surface);
}

/**
 * An outline on `surface`: kept from 3:1, else the site link colour, else a
 * site colour moved just enough (`own`), else the label, else white or black.
 */
export function guardOutline(line: Rgb, surface: Rgb, linkColor: Rgb | null, label: Rgb, own = false): Rgb {
  if (contrast(line, surface) >= BOUNDARY_MIN) return line;
  if (linkColor && contrast(linkColor, surface) >= BOUNDARY_MIN) return linkColor;
  if (own) {
    const moved = nudge(line, surface, (candidate) => contrast(candidate, surface) >= BOUNDARY_MIN, 0.6);
    if (moved) return moved;
  }
  return contrast(label, surface) >= BOUNDARY_MIN ? label : blackOrWhite(surface);
}

const same = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/**
 * The checkout card surface: the theme's card (themeCard, null on a site's
 * own answer colour), else the bubble colour lifted toward white, 70% on a
 * light bubble and 8% on a dark one, else the bubble colour. It is the first
 * on which the answer text reads at 4.5:1, or at its own ratio on the bubble
 * if that is lower.
 */
export function cardSurface(bubble: Rgb, text: Rgb | null, themeCard: Rgb | null = null): Rgb {
  const light = contrast(BLACK, bubble) >= contrast(WHITE, bubble);
  const lifted = mix(bubble, WHITE, light ? 0.7 : 0.08);
  if (!text) return themeCard || lifted;
  const floor = Math.min(TEXT_MIN, contrast(text, bubble));
  for (const candidate of [themeCard, lifted]) {
    if (candidate && contrast(text, candidate) >= floor) return candidate;
  }
  return bubble;
}

/** The venue line: the title colour toned toward the card while it keeps 4.5:1, else the title colour. */
export function cardMetaColor(text: Rgb, card: Rgb): Rgb {
  for (const amount of [0.22, 0.12]) {
    const toned = mix(text, card, amount);
    if (contrast(toned, card) >= TEXT_MIN) return toned;
  }
  return text;
}

const IMAGE = "image";

/**
 * The background colour that a style sets, IMAGE for a gradient or an image
 * (the visible surface, which the widget cannot measure), or undefined.
 */
function styleBackground(style: React.CSSProperties | undefined): string | undefined {
  const background = style?.background;
  if (typeof background === "string" && background.trim() && !parseColor(background)) return IMAGE;
  const color = style?.backgroundColor || background;
  return typeof color === "string" && color.trim() ? color : undefined;
}

/** A surface colour: null for an image or a colour that cannot be read. */
const surface = (value: string | undefined, backdrop: Rgb | null) =>
  value === IMAGE ? null : resolve(value, backdrop);

/** The surfaces and colours that a site's props and the theme give. */
function surfaces(props: ControlColorProps) {
  const theme = THEME_COLORS[(props.theme as ThemeName) in THEME_COLORS ? (props.theme as ThemeName) : "default"];
  // background_color paints the list and the input bar (!important in the stylesheet).
  const list = props.background_color ? resolve(props.background_color, null) : resolve(theme.list, null);
  // bot_message_color wins over a background colour in bot_message_style
  // (!important), but a gradient or an image in bot_message_style shows on top.
  const bubbleStyle = styleBackground(props.bot_message_style);
  const bubble = bubbleStyle === IMAGE ? null : surface(props.bot_message_color || bubbleStyle || theme.bubble, list);
  const bubbleText = resolve(props.bot_message_text_color || props.bot_message_style?.color || theme.bubbleText, bubble);
  // The field sits on the input bar: background_color, else
  // input_container_style, else the theme. A bar that is not opaque shows
  // the theme's window behind it.
  const bar = props.background_color
    ? resolve(props.background_color, null)
    : surface(styleBackground(props.input_container_style) || theme.fieldBackdrop, resolve(theme.window, null));
  const field = resolve(props.input_style?.backgroundColor || theme.field, bar);
  const customError = !!props.error_message_style && Object.keys(props.error_message_style).length > 0;
  const errorBg = surface(styleBackground(props.error_message_style) || (customError ? "#f87171" : theme.errorBg), list);
  const errorInk = resolve(props.error_message_style?.color || (customError ? "#ffffff" : theme.errorInk), errorBg);
  // The checkout card: the theme's card, or a lift of the site's own bubble
  // (cardSurface). Its venue line takes the theme's colour on the theme's
  // card, unless the site sets the text colour or the theme's colour reads
  // worse than the answer text floor: then it follows the answer text.
  const ownBubble = !!(props.bot_message_color || bubbleStyle);
  const ownText = !!(props.bot_message_text_color || props.bot_message_style?.color);
  const themeCard = bubble && !ownBubble ? resolve(theme.card, bubble) : null;
  const card = bubble ? cardSurface(bubble, bubbleText, themeCard) : null;
  const themedCard = !!card && !!themeCard && same(card, themeCard);
  const floor = bubble && bubbleText ? Math.min(TEXT_MIN, contrast(bubbleText, bubble)) : 0;
  const themeMeta = card && themedCard && !ownText ? resolve(theme.cardMeta, card) : null;
  const metaFromTheme = !!card && !!themeMeta && contrast(themeMeta, card) >= floor;
  const cardMeta = !card ? null : metaFromTheme ? themeMeta : bubbleText && cardMetaColor(bubbleText, card);
  return {
    theme, list, bubble, bubbleText, bar, field, errorBg, errorInk, card, cardMeta, themedCard, metaFromTheme,
  };
}

/** The opacity of a subtitle in a site's button_text_color (.cl-header-subtitle). */
const SUBTITLE_OPACITY = 0.85;

/** The red of the confirm button in the new-conversation dialog (ConfirmationModal). */
const DIALOG_REDS = ["#dc2626", "#ef4444"];
/** Colour names that a site may give as button_text_color. */
const DIALOG_NAMES: Record<string, string> = { white: "#ffffff", black: "#000000" };

/**
 * The confirm button of the new-conversation dialog without button_color: its
 * text (button_text_color, else white) on the dialog red (4.5:1). White reads
 * on the stylesheet red #dc2626. A dark site text reads on the lighter #ef4444
 * of v1.0.24 and keeps it. A text that reads on neither red turns white or
 * black. A colour the widget cannot read (a name other than white or black,
 * hsl()) keeps the #ef4444 of v1.0.24. Returns only the colours that change.
 */
export function guardDialogConfirm(text?: string): { fill?: string; label?: string } {
  const value = (text || "#ffffff").trim();
  const label = parseColor(DIALOG_NAMES[value.toLowerCase()] || value);
  if (!label) return { fill: DIALOG_REDS[1] };
  for (const red of DIALOG_REDS) {
    const fill = resolve(red, null)!;
    if (contrast(paintOver(label.rgb, label.alpha, fill), fill) >= TEXT_MIN) {
      return red === DIALOG_REDS[0] ? {} : { fill: red };
    }
  }
  return { label: toHex(blackOrWhite(resolve(DIALOG_REDS[0], null)!)) };
}

/** The colours of the closed hint in the stylesheet (.cl-closed-widget-hint). */
const HINT_BACKGROUND = "#ffffff";
const HINT_TEXT = "#111827";

/**
 * The closed hint: its text on its own background (4.5:1). A site's colour
 * wins over the stylesheet colour: with only a site background, the text turns
 * white or black; with only a site text colour, the background turns dark or
 * white. With both, the site background is moved just enough while the site's
 * text still reads on it, else the text turns white or black. Returns only the
 * colours that change.
 */
export function guardHintColors(background?: string, text?: string): { background?: string; text?: string } {
  const fill = resolve(background || HINT_BACKGROUND, null);
  const label = parseColor(text || HINT_TEXT);
  // A transparent background shows the page, which the widget cannot measure.
  if (!fill || !label) return {};
  const labelOn = (next: Rgb) => (label.alpha >= 0.999 ? label.rgb : paintOver(label.rgb, label.alpha, next));
  if (contrast(labelOn(fill), fill) >= TEXT_MIN) return {};
  if (text && !background) {
    // The stylesheet's white gives way to its dark text colour, else white or black.
    const dark = resolve(HINT_TEXT, null)!;
    const next = contrast(labelOn(dark), dark) >= TEXT_MIN ? dark : blackOrWhite(label.rgb);
    // A translucent text that reads on neither turns opaque black or white.
    if (contrast(labelOn(next), next) < TEXT_MIN) return { text: toHex(blackOrWhite(fill)) };
    return { background: toHex(next), ...(label.alpha < 0.999 ? { text: toHex(labelOn(next)) } : {}) };
  }
  if (background && text) {
    const moved = nudge(fill, fill, (candidate) => contrast(labelOn(candidate), candidate) >= TEXT_MIN, 0.6);
    if (moved) return { background: toHex(moved), ...(label.alpha < 0.999 ? { text: toHex(labelOn(moved)) } : {}) };
  }
  return { text: toHex(blackOrWhite(fill)) };
}

/**
 * The colours to change for the given props, and every measured pair after
 * the change (for tests and diagnostics).
 */
export function guardControlColors(props: ControlColorProps): { colors: GuardedColors; pairs: ControlContrast[] } {
  const {
    theme, list, bubble, bubbleText, bar, field, errorBg, errorInk, card, cardMeta, themedCard, metaFromTheme,
  } = surfaces(props);
  const colors: GuardedColors = {};
  const pairs: ControlContrast[] = [];
  const measure = (control: string, foreground: Rgb, background: Rgb, minimum: number) => {
    pairs.push({
      control, foreground: toHex(foreground), background: toHex(background),
      ratio: Math.round(contrast(foreground, background) * 100) / 100, minimum,
    });
  };
  const ownLink = resolve(props.link_color, bubble);

  // Links in answers (inline and outlined link buttons). A link_color that
  // the widget cannot read (a colour name) stays as it is.
  let link: Rgb | null = null;
  if (props.link_color && !ownLink) {
    // Nothing to check.
  } else if (bubble) {
    if (ownLink) {
      link = guardOwnText(ownLink, bubble, bubbleText);
      if (!same(link, ownLink)) colors.link = toHex(link);
    } else {
      const themeLink = resolve(theme.link, bubble)!;
      if (contrast(themeLink, bubble) >= TEXT_MIN) {
        link = themeLink;
      } else {
        // Links take the answer text colour. Where that text fails too, they
        // take a dark or light shade of the bubble colour that reads.
        colors.linksTakeTextColor = true;
        link = bubbleText && contrast(bubbleText, bubble) >= TEXT_MIN
          ? bubbleText
          : nudge(bubble, bubble, (candidate) => contrast(candidate, bubble) >= TEXT_MIN) || blackOrWhite(bubble);
        if (!bubbleText || !same(link, bubbleText)) colors.link = toHex(link);
      }
    }
    measure("link", link, bubble, TEXT_MIN);
    // Outlined link buttons draw their outline and their focus ring in the link colour.
    measure("outlined link button", link, bubble, BOUNDARY_MIN);
    measure("outlined link button focus mark", link, bubble, BOUNDARY_MIN);
  } else {
    // An answer colour the widget cannot read (a gradient): links take the text colour.
    colors.linksTakeTextColor = !ownLink;
  }

  // A theme colour that fails on a surface falls back to the theme's link
  // colour, else (dark themes on a light site colour) its mid accent.
  const themeFallback = (surface: Rgb) => [theme.link, theme.accentOnLight]
    .map((color) => resolve(color, surface))
    .find((color): color is Rgb => !!color && contrast(color, surface) >= BOUNDARY_MIN) ?? null;

  // Filled link buttons on the answer bubble. A colour that the widget cannot
  // read (a gradient, a colour name) leaves the button as it is.
  const ownAccent = resolve(props.button_color, bubble);
  const accent = ownAccent || resolve(theme.accent, null)!;
  const accentLabel = parseColor(props.button_color ? props.button_text_color || "#ffffff" : theme.onAccent);
  // Without button_color, the button takes the site's own colours first: its
  // link colour, its send button, its visitor bubbles (a gradient or an image
  // does not count). Their label is button_text_color, else white. The
  // swarovski theme shows text links and keeps the theme colours.
  const sendStyle = styleBackground(props.send_button_style);
  const userStyle = styleBackground(props.user_message_style);
  const siteColors = props.button_color || props.theme === "swarovski" ? [] : [
    props.link_color,
    sendStyle === IMAGE ? undefined : sendStyle,
    userStyle === IMAGE ? undefined : props.user_message_color || userStyle,
  ].filter((color): color is string => !!color);
  const siteLabel = parseColor(props.button_text_color || "#ffffff") || { rgb: WHITE, alpha: 1 };
  const siteFilledOn = (surface: Rgb) => {
    for (const value of siteColors) {
      const color = resolve(value, surface);
      const filled = color && siteFilled(color, siteLabel, surface, TEXT_MIN);
      if (filled) return filled;
    }
    return null;
  };
  if (bubble && accentLabel && (!props.button_color || ownAccent)) {
    // The theme's order: button_color or the theme accent, else the site
    // link colour, else (a theme colour) the theme fallback, else white or black.
    const themeFilledOn = (surface: Rgb) => guardFilled({
      fill: accent, label: accentLabel.rgb, labelAlpha: accentLabel.alpha, surface, labelMin: TEXT_MIN,
      own: !!props.button_color, linkColor: link && ownLink ? link : null,
      themeFallback: themeFallback(surface),
    });
    const guarded = siteFilledOn(bubble) || themeFilledOn(bubble);
    const fillChanged = !same(guarded.fill, accent);
    if (fillChanged) colors.linkButtonFill = toHex(guarded.fill);
    // A translucent label is set too when the fill changes: the stylesheet
    // would paint it on the new fill without a check.
    if (!same(guarded.label, paintOver(accentLabel.rgb, accentLabel.alpha, accent))
      || (fillChanged && accentLabel.alpha < 0.999)) {
      colors.linkButtonLabel = toHex(guarded.label);
    }
    measure("filled link button", guarded.fill, bubble, BOUNDARY_MIN);
    // The stylesheet draws the focus ring in the fill colour, on the bubble.
    measure("filled link button focus mark", guarded.fill, bubble, BOUNDARY_MIN);
    measure("filled link button label", guarded.label, guarded.fill, TEXT_MIN);

    // The checkout card button takes the same fill. The card is lighter than
    // the bubble, so the fill is checked again on the card; only where it
    // fails there does the card button get a colour of its own. With site
    // colours, that is the first site colour that reads on the card, else
    // the theme's order on the card.
    if (card) {
      const onCard = siteColors.length && contrast(guarded.fill, card) < BOUNDARY_MIN
        ? siteFilledOn(card) || themeFilledOn(card)
        : guardFilled({
          fill: guarded.fill, label: guarded.label, surface: card, labelMin: TEXT_MIN,
          own: !!props.button_color, linkColor: link && ownLink ? link : null, themeFallback: themeFallback(card),
        });
      if (!same(onCard.fill, guarded.fill)) colors.cardButtonFill = toHex(onCard.fill);
      if (!same(onCard.label, guarded.label)) colors.cardButtonLabel = toHex(onCard.label);
      measure("checkout card button", onCard.fill, card, BOUNDARY_MIN);
      // The focus ring takes the fill too, on the card.
      measure("checkout card button focus mark", onCard.fill, card, BOUNDARY_MIN);
      measure("checkout card button label", onCard.label, onCard.fill, TEXT_MIN);
    }
  }

  // The checkout card: its title in the answer text colour, its venue line.
  if (card) {
    if (!themedCard) {
      colors.cardSurface = "custom";
      colors.cardBg = toHex(card);
    }
    if (cardMeta && !metaFromTheme) colors.cardMeta = toHex(cardMeta);
    if (bubbleText) {
      // A site that chose a low contrast for its answers keeps it on the card.
      const floor = Math.floor(Math.min(TEXT_MIN, contrast(bubbleText, bubble!)) * 100) / 100;
      measure("checkout card title", bubbleText, card, floor);
      if (cardMeta) measure("checkout card venue", cardMeta, card, floor);
    }
  } else if (!bubble) {
    colors.cardSurface = "image";
  }

  // Suggestion chips on the message list. button_color draws their outline.
  if (list) {
    const chipBg = theme.chipBg ? resolve(theme.chipBg, list)! : list;
    const chipInkTheme = resolve(theme.chipInk, chipBg)!;
    const chipInk = contrast(chipInkTheme, chipBg) >= TEXT_MIN ? chipInkTheme : pickLabel(chipBg, TEXT_MIN, null, null);
    if (!same(chipInk, chipInkTheme)) colors.chipInk = toHex(chipInk);
    const ownChipLine = resolve(props.button_color, list);
    if (!props.button_color || ownChipLine) {
      const chipLineValue = ownChipLine || resolve(theme.chipLine, list)!;
      const boundary = Math.max(contrast(chipBg, list), contrast(chipLineValue, list));
      const chipLine = boundary >= BOUNDARY_MIN
        ? chipLineValue
        : guardOutline(chipLineValue, list, ownLink, chipInk, !!ownChipLine);
      if (!same(chipLine, chipLineValue)) colors.chipLine = toHex(chipLine);
      measure("suggestion chip", contrast(chipBg, list) >= contrast(chipLine, list) ? chipBg : chipLine, list, BOUNDARY_MIN);
    }
    measure("suggestion chip label", chipInk, chipBg, TEXT_MIN);
  }

  // The send button in the input field. send_button_style wins (spread
  // last); a gradient or an image in it leaves the button as it is.
  const sendFill = sendStyle === IMAGE ? null : resolve(sendStyle || props.button_color || theme.send || undefined, field);
  const sendIcon = parseColor(props.send_icon_style?.stroke || props.button_text_color || theme.sendIcon);
  if (field && sendFill && sendIcon && same(sendFill, field)) {
    // A fill in the field's own colour shows no button, only its icon: an
    // icon-only button (Swarovski: a black paper plane in a white field).
    // Only the icon must read on the field.
    const icon = paintOver(sendIcon.rgb, sendIcon.alpha, field);
    const guardedIcon = contrast(icon, field) >= ICON_MIN ? icon : pickLabel(field, ICON_MIN, null, null);
    if (!same(guardedIcon, icon)) colors.sendIcon = toHex(guardedIcon);
    measure("send button icon", guardedIcon, field, ICON_MIN);
  } else if (field && sendFill && sendIcon) {
    const guarded = guardFilled({
      fill: sendFill, label: sendIcon.rgb, labelAlpha: sendIcon.alpha, surface: field, labelMin: ICON_MIN,
      own: !!(sendStyle || props.button_color),
      linkColor: ownLink && resolve(props.link_color, field), themeFallback: themeFallback(field),
    });
    const fillChanged = !same(guarded.fill, sendFill);
    if (fillChanged) colors.sendFill = toHex(guarded.fill);
    if (!same(guarded.label, paintOver(sendIcon.rgb, sendIcon.alpha, sendFill)) || (fillChanged && sendIcon.alpha < 0.999)) {
      colors.sendIcon = toHex(guarded.label);
    }
    measure("send button", guarded.fill, field, BOUNDARY_MIN);
    measure("send button icon", guarded.label, guarded.fill, ICON_MIN);
  }

  // The AI notice in the input bar, in the theme's muted grey. A gradient or
  // an image on the bar leaves it as it is.
  const muted = bar && resolve(theme.muted, bar);
  if (bar && muted) {
    const notice = contrast(muted, bar) >= TEXT_MIN
      ? muted
      : nudge(muted, bar, (candidate) => contrast(candidate, bar) >= TEXT_MIN) || blackOrWhite(bar);
    if (!same(notice, muted)) colors.noticeInk = toHex(notice);
    measure("AI notice", notice, bar, TEXT_MIN);
  }

  // "Try again" in the error message: its label and outline take the text colour.
  if (errorBg && errorInk) {
    const retry = contrast(errorInk, errorBg) >= TEXT_MIN ? errorInk : pickLabel(errorBg, TEXT_MIN, null, null);
    if (!same(retry, errorInk)) colors.retryLabel = toHex(retry);
    measure("try again label", retry, errorBg, TEXT_MIN);
  }

  // The header icon. button_text_color colours it only together with
  // button_color, as the title. A colour the widget cannot read (a colour
  // name, a translucent header) leaves it as it is.
  const headerInk = parseColor(props.button_color ? props.button_text_color || "#ffffff" : theme.headerInk);
  const headers = (props.button_color ? [props.button_color] : theme.header).map((color) => resolve(color, null));
  if (headerInk && headers.every((header): header is Rgb => !!header)) {
    // On a gradient, the stop where the icon reads worst.
    const inkOn = (surface: Rgb) => paintOver(headerInk.rgb, headerInk.alpha, surface);
    const worst = headers.reduce((a, b) => (contrast(inkOn(b), b) < contrast(inkOn(a), a) ? b : a));
    let backdrop = worst;
    if (contrast(inkOn(worst), worst) < ICON_MIN) {
      // The smallest darker or lighter shade of the header that carries the
      // icon, up to black or white. None helps a nearly transparent icon.
      const plate = nudge(worst, inkOn(worst), (candidate) => contrast(inkOn(candidate), candidate) >= ICON_MIN);
      if (plate) {
        backdrop = plate;
        colors.headerIconPlate = toHex(plate);
      }
    }
    measure("header icon", inkOn(backdrop), backdrop, ICON_MIN);

    // The subtitle shows button_text_color at 85% (the stylesheet). Where
    // that falls below 4.5:1, it shows at full opacity. The swarovski theme
    // keeps the branch's 85%.
    const header = headers[0];
    const subtitle = paintOver(headerInk.rgb, headerInk.alpha * SUBTITLE_OPACITY, header);
    if (props.button_color && props.theme !== "swarovski" && contrast(subtitle, header) < TEXT_MIN) {
      colors.subtitleOpaque = true;
    }
  }

  return { colors, pairs };
}
