/*
 * mobile_chat_window_style: the place and size of the open window in the
 * phone layout (640 px wide or less). It came from the swarovski-widget
 * branch (c2386e2, December 2025), with the same keys: top, right, bottom,
 * left, width, height and maxHeight. Each key replaces the phone default of
 * that property. Other keys are ignored: chat_window_style styles the window
 * itself at all sizes.
 *
 * Since #77 the phone window fits the visible part of the page, not the
 * layout viewport. The keys follow it:
 * - top, right, bottom and left are gaps to the edges of the visible area.
 * - vh and vw measure the visible area, so the on-screen keyboard and the
 *   browser toolbars make the window shorter, and on a scaled page (Wix) the
 *   units measure the screen, not the small page.
 * - The window never leaves the visible area. Its header, close X and send
 *   button stay on the screen.
 * - The keys are the site's own lengths: they do not add the safe areas
 *   (notch, home indicator). A value can use env(safe-area-inset-*). The
 *   window gets paddings for the safe areas that its gaps do not clear.
 */
import { ScaledPage, viewportLength } from "./scaledPage";
import { safeAreaGap, safeAreaInset, ViewportEdge, visualViewportInset } from "./utils";

export const MOBILE_CHAT_WINDOW_STYLE_KEYS = ["top", "right", "bottom", "left", "width", "height", "maxHeight"] as const;
export type MobileChatWindowStyleKey = typeof MOBILE_CHAT_WINDOW_STYLE_KEYS[number];
/** The valid keys only, each one a CSS length. */
export type MobileChatWindowStyle = Partial<Record<MobileChatWindowStyleKey, string>>;

const CSS_PROPERTIES: Record<MobileChatWindowStyleKey, string> = {
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
  width: "width",
  height: "height",
  maxHeight: "max-height",
};

// Lengths, percentages and CSS functions such as calc(), min() and env().
// No ";", "{", "}", "!" or quotes: the value goes into a style sheet.
const LENGTH_CHARACTERS = /^[\w\s.,%+\-*/()]+$/;
// A keyword such as auto, none or inherit. It cannot go into calc().
const KEYWORD = /^[a-z-]+$/i;
const IMPORTANT = /\s*!\s*important\s*$/i;
const PLAIN_NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;

function readLength(key: MobileChatWindowStyleKey, value: unknown): string | undefined {
  // A number is px, as in a React style object. So is "65": in calc() and
  // max(), a plain number is no length, not even 0.
  if (typeof value === "number") return Number.isFinite(value) ? `${value}px` : undefined;
  if (typeof value !== "string") return undefined;
  let length = value.replace(IMPORTANT, "").trim();
  if (PLAIN_NUMBER.test(length)) length = `${length}px`;
  if (!length || !LENGTH_CHARACTERS.test(length) || KEYWORD.test(length)) return undefined;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports(CSS_PROPERTIES[key], length)) {
    return undefined;
  }
  return length;
}

/**
 * The valid keys of the prop. Invalid values and other keys are left out.
 * The prop comes from JSON, so it can be any value.
 */
export function readMobileChatWindowStyle(style: unknown): MobileChatWindowStyle {
  const result: MobileChatWindowStyle = {};
  if (!style || typeof style !== "object" || Array.isArray(style)) return result;
  for (const key of MOBILE_CHAT_WINDOW_STYLE_KEYS) {
    const length = readLength(key, (style as Record<string, unknown>)[key]);
    if (length !== undefined) result[key] = length;
  }
  return result;
}

/*
 * A theme's own phone window, under the prop. The swarovski theme keeps the
 * box of the swarovski-widget branch: 8 px from the left and calc(100vw -
 * 16px) wide, capped by the branch's inline max-width of 90vw. On a 390 px
 * phone that is 351 px wide, with 8 px on the left and 31 px on the right.
 */
const THEME_PHONE_WINDOWS: Record<string, MobileChatWindowStyle> = {
  swarovski: { left: "8px", width: "min(calc(100vw - 16px), 90vw)" },
};

const AXES: MobileChatWindowStyleKey[][] = [["left", "right", "width"], ["top", "bottom", "height", "maxHeight"]];

/**
 * The prop over the theme's phone window. A prop key of one axis replaces
 * all theme keys of that axis, so that the prop places the window alone.
 */
export function phoneWindowStyle(style: unknown, theme?: string): MobileChatWindowStyle {
  const own = readMobileChatWindowStyle(style);
  const themed = (theme && Object.prototype.hasOwnProperty.call(THEME_PHONE_WINDOWS, theme) && THEME_PHONE_WINDOWS[theme]) || {};
  const result: MobileChatWindowStyle = {};
  for (const axis of AXES) {
    const source = axis.some((key) => own[key] !== undefined) ? own : themed;
    for (const key of axis) if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

const NUMBER_TOKEN = /-?(?:\d+\.?\d*|\.\d+)[a-z%]*/gi;
const VIEWPORT_LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))[sld]?v([hw])$/i;
const PX_LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))px$/i;
const round = (value: number) => Math.round(value * 100) / 100;

/*
 * A length of the prop for the phone window CSS:
 * - vh and vw (also dvh, svh, lvh) become shares of the visible area.
 * - pageScale: on a scaled page, px are page px, as bottom_offset and
 *   top_offset. The gaps clear host elements, and those scale with the page.
 */
function visibleLength(length: string, scaledPage: ScaledPage | null, pageScale: number) {
  return length.replace(NUMBER_TOKEN, (token: string, offset: number, whole: string) => {
    // Part of a name, such as --space-2vh.
    if (offset > 0 && /[\w.-]/.test(whole[offset - 1])) return token;
    const viewport = VIEWPORT_LENGTH.exec(token);
    if (viewport) {
      const [, amount, axis] = viewport;
      const vertical = axis.toLowerCase() === "h";
      const size = vertical ? "--cl-visual-viewport-height" : "--cl-visual-viewport-width";
      const fallback = viewportLength(100, vertical ? "vh" : "vw", scaledPage);
      return `calc(${amount} * var(${size}, ${fallback}) / 100)`;
    }
    const px = PX_LENGTH.exec(token);
    if (px && pageScale !== 1) return `${round(Number(px[1]) * pageScale)}px`;
    return token;
  });
}

// The visible area. trackVisualViewport sets the variables (utils.ts). In the
// scaled page frame, they are the frame (getScaledFrameVisualViewport).
const VISIBLE_LEFT = "var(--cl-visual-viewport-left, 0px)";
const VISIBLE_WIDTH = "var(--cl-visual-viewport-width, 100%)";
const VISIBLE_HEIGHT = "var(--cl-visual-viewport-height, 100%)";
// The phone defaults: the window starts top_offset below the top of the
// visible area and keeps 80 px above its bottom for the trigger, plus the
// safe area of the home indicator. While the on-screen keyboard is open, the
// chat window styles set --cl-trigger-room to 0: the window then ends at the
// keyboard and covers the trigger. Its header has a close button. A short
// screen (640 x 420 px or less, such as a desktop at 400 % zoom) also sets
// --cl-top-offset to 0, and keeps only the home indicator as trigger room.
const DEFAULT_TOP_GAP = "var(--cl-top-offset, 0px)";
const DEFAULT_BOTTOM_GAP = `var(--cl-trigger-room, ${safeAreaGap("bottom", "80px")})`;

// Padding for the part of the safe area that a gap does not clear.
const safeAreaBeyond = (edge: ViewportEdge, gap: string) => `max(0px, ${safeAreaInset(edge)} - ${gap})`;

/*
 * The place and size declarations of .cl-chat-window in the phone layout,
 * one per item. Without the prop, they are the phone defaults. With it:
 * - bottom without top places the window from the bottom; right without left
 *   places it from the right. Else the window keeps the top-left corner.
 * - Without height (width), the window fills the visible area between the
 *   two gaps.
 * - maxHeight defaults to height, as on the swarovski-widget branch.
 * - The window is at most as large as the visible area minus its gap, so no
 *   part of it leaves the screen. Gaps are 0 or more.
 * - Paddings keep the content out of the safe areas that the gaps do not
 *   clear. Without the prop, the bottom gap clears the home indicator.
 * - The lengths of the prop are rounded to whole px. 98vh - 120px put the
 *   window top at y 69.81 on a 360 x 740 phone, and Chromium then showed the
 *   page through a 1 px gap above the input. A browser without CSS round()
 *   keeps the declaration before it, without rounding.
 */
export function phoneWindowDeclarations(
  style: MobileChatWindowStyle,
  scaledPage: ScaledPage | null = null
): string[] {
  const pageScale = scaledPage?.scale ?? 1;
  const box = (whole: (length: string) => string): [string, string][] => {
    const size = (length?: string) => (length === undefined ? undefined : whole(visibleLength(length, scaledPage, 1)));
    const gap = (length?: string) =>
      length === undefined ? undefined : whole(`max(0px, ${visibleLength(length, scaledPage, pageScale)})`);
    const top = gap(style.top);
    const right = gap(style.right);
    const bottom = gap(style.bottom);
    const left = gap(style.left);
    const width = size(style.width);
    const height = size(style.height);
    const maxHeight = size(style.maxHeight) ?? height;

    const fromBottom = bottom !== undefined && top === undefined;
    const topGap = top ?? DEFAULT_TOP_GAP;
    const fillHeight = `calc(${VISIBLE_HEIGHT} - ${bottom ?? DEFAULT_BOTTOM_GAP} - ${topGap})`;
    const heightRoom = `calc(${VISIBLE_HEIGHT} - ${fromBottom ? bottom : topGap})`;

    const fromRight = right !== undefined && left === undefined;
    const horizontalGaps = left !== undefined || right !== undefined;
    const fillWidth = horizontalGaps
      ? `calc(${VISIBLE_WIDTH} - ${left ?? "0px"} - ${right ?? "0px"})`
      : VISIBLE_WIDTH;
    const widthRoom = horizontalGaps
      ? `calc(${VISIBLE_WIDTH} - ${fromRight ? right : left})`
      : VISIBLE_WIDTH;

    /*
     * The window background reaches the gaps. The paddings keep the header,
     * the input and the messages out of the safe areas (notch, rounded
     * corners, home indicator) that a gap does not clear. An edge without a
     * known gap gets no padding. A window placed from the bottom keeps the
     * whole top inset, as before.
     */
    const padding: [string, string][] = [
      ["padding-top", fromBottom ? safeAreaInset("top") : safeAreaBeyond("top", topGap)],
    ];
    if (bottom !== undefined) padding.push(["padding-bottom", safeAreaBeyond("bottom", bottom)]);
    if (!horizontalGaps) {
      padding.push(["padding-left", safeAreaInset("left")], ["padding-right", safeAreaInset("right")]);
    } else {
      if (left !== undefined) padding.push(["padding-left", safeAreaBeyond("left", left)]);
      if (right !== undefined) padding.push(["padding-right", safeAreaBeyond("right", right)]);
    }

    return [
      ["top", fromBottom ? "auto" : visualViewportInset("top", topGap)],
      ["left", fromRight ? "auto" : left === undefined ? VISIBLE_LEFT : visualViewportInset("left", left)],
      ["right", fromRight ? visualViewportInset("right", right!) : "auto"],
      ["bottom", fromBottom ? visualViewportInset("bottom", bottom!) : "auto"],
      ["width", width ?? fillWidth],
      ["height", height ?? fillHeight],
      ["max-height", maxHeight === undefined ? fillHeight : `min(${maxHeight}, ${heightRoom})`],
      ["max-width", widthRoom],
      ...padding,
    ];
  };
  const plain = box((length) => length);
  const rounded = box((length) => `round(${length}, 1px)`);
  // The rounded declarations follow the plain ones. Without the prop, they are the same.
  return [...plain, ...rounded.filter(([, value], index) => value !== plain[index][1])]
    .map(([property, value]) => `${property}: ${value} !important;`);
}
