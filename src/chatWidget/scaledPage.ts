/*
 * Host pages with a small fixed layout width, such as Wix sites with
 * <meta name="viewport" content="width=320">. The browser scales the whole
 * page up to the screen width. On a phone in landscape (740 x 360 px), the
 * page is 320 x 156 CSS px at a scale of 2.3. The widget lays out in CSS px,
 * so the phone window got 156 px minus the top offset and the trigger gap:
 * a 16 px strip.
 *
 * On such a page the widget root becomes a frame over the visible part of
 * the page, scaled down by the page scale. Inside the frame one CSS px is one
 * screen px again, so the widget lays out as on a page with
 * width=device-width. Media queries still see the 320 px page, so the window
 * takes its layout rules from the frame size (screenRules).
 */
import { CSSProperties, useLayoutEffect, useState } from "react";
import { getLayoutViewportSize, getPageScale, subscribeVisualViewport } from "./utils";

// From this page scale on, the widget lays out at the screen size. Below it,
// the widget is at most 10 % larger than designed.
export const SCALED_PAGE_MIN_SCALE = 1.1;

export type ScaledPage = {
  /** Screen px per CSS px of the page. The root scales down by 1 / scale. */
  scale: number;
  /** The layout viewport in frame px: the size that media queries see on other pages. */
  width: number;
  height: number;
};

/*
 * CSS variables on the root while it is a frame. Left and top are page px.
 * Width and height are frame px: the visible part of the page, without the
 * on-screen keyboard.
 */
export const SCALED_FRAME_PROPERTIES = {
  left: "--cl-frame-left",
  top: "--cl-frame-top",
  width: "--cl-frame-width",
  height: "--cl-frame-height",
} as const;

export function readScaledPage(): ScaledPage | null {
  if (typeof window === "undefined") return null;
  const scale = getPageScale();
  if (!(scale >= SCALED_PAGE_MIN_SCALE)) return null;
  const layout = getLayoutViewportSize();
  return {
    scale,
    width: Math.round(layout.width * scale),
    height: Math.round(layout.height * scale),
  };
}

const isSameScaledPage = (first: ScaledPage | null, second: ScaledPage | null) =>
  first === second ||
  (!!first && !!second &&
    Math.abs(first.scale - second.scale) < 0.001 &&
    first.width === second.width &&
    first.height === second.height);

/*
 * The scaled page, or null on other pages and while `enabled` is false. It
 * changes on a rotation or a window resize. The on-screen keyboard and pinch
 * zoom leave it as it is, so they do not render the widget again.
 */
export function useScaledPage(enabled: boolean): ScaledPage | null {
  const [scaledPage, setScaledPage] = useState(() => (enabled ? readScaledPage() : null));

  useLayoutEffect(() => {
    if (!enabled) return;
    const update = () => {
      const next = readScaledPage();
      setScaledPage((previous) => (isSameScaledPage(previous, next) ? previous : next));
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [enabled]);

  return enabled ? scaledPage : null;
}

/*
 * Keep the frame over the visible part of the page, now and after each pan,
 * on-screen keyboard and resize. Other boxes cover the layout viewport, as
 * a plain fixed box does:
 * - The closed widget on a page that fits the screen. Its trigger stays
 *   behind the on-screen keyboard and cannot cover a host form field, as on
 *   other pages (#77).
 * - The widget while the visitor pinch-zooms in. It zooms with the page,
 *   and the visitor can pan over it.
 * Returns a function that stops the updates and removes the variables.
 */
export function trackScaledFrame(frame: HTMLElement, scale: number, open: boolean) {
  const stop = subscribeVisualViewport((box) => {
    const layout = getLayoutViewportSize();
    const followScreen = !!box && (open || document.documentElement.scrollWidth > box.width + 1);
    const visible = box && followScreen
      ? box
      : { offsetLeft: 0, offsetTop: 0, width: layout.width, height: layout.height };
    const values = {
      [SCALED_FRAME_PROPERTIES.left]: `${visible.offsetLeft}px`,
      [SCALED_FRAME_PROPERTIES.top]: `${visible.offsetTop}px`,
      [SCALED_FRAME_PROPERTIES.width]: `${visible.width * scale}px`,
      [SCALED_FRAME_PROPERTIES.height]: `${visible.height * scale}px`,
    };
    for (const [property, value] of Object.entries(values)) {
      // A changed variable restyles the whole widget. Write only changes.
      if (frame.style.getPropertyValue(property) !== value) frame.style.setProperty(property, value);
    }
  });
  return () => {
    stop();
    Object.values(SCALED_FRAME_PROPERTIES).forEach((property) => frame.style.removeProperty(property));
  };
}

/*
 * The root style while it is a frame. The variables are not set before the
 * first layout effect, so the frame then covers the layout viewport.
 * pointer-events: none keeps the host page usable around the widget. The
 * trigger, the window and the checkout dialog set it back to auto.
 */
export function getScaledFrameStyle(scaledPage: ScaledPage): CSSProperties {
  const { left, top, width, height } = SCALED_FRAME_PROPERTIES;
  return {
    position: "fixed",
    left: `var(${left}, 0px)`,
    top: `var(${top}, 0px)`,
    right: "auto",
    bottom: "auto",
    width: `var(${width}, ${scaledPage.width}px)`,
    height: `var(${height}, ${scaledPage.height}px)`,
    transform: `scale(${1 / scaledPage.scale})`,
    transformOrigin: "0 0",
    pointerEvents: "none",
  };
}

/*
 * Inside the frame, the visible part of the page is the frame itself. The
 * window CSS reads it from the visual viewport variables (utils.ts).
 */
export function getScaledFrameVisualViewport(scaledPage: ScaledPage): Record<string, string> {
  return {
    "--cl-visual-viewport-left": "0px",
    "--cl-visual-viewport-top": "0px",
    "--cl-visual-viewport-width": `var(${SCALED_FRAME_PROPERTIES.width}, ${scaledPage.width}px)`,
    "--cl-visual-viewport-height": `var(${SCALED_FRAME_PROPERTIES.height}, ${scaledPage.height}px)`,
  };
}

/** A screen size condition of the window CSS, in px. */
export type ScreenQuery = { minWidth?: number; maxWidth?: number; maxHeight?: number };

const screenQueryText = ({ minWidth, maxWidth, maxHeight }: ScreenQuery) =>
  [
    minWidth === undefined ? "" : `(min-width: ${minWidth}px)`,
    maxWidth === undefined ? "" : `(max-width: ${maxWidth}px)`,
    maxHeight === undefined ? "" : `(max-height: ${maxHeight}px)`,
  ].filter(Boolean).join(" and ");

export const matchesScreenQuery = (
  { minWidth = 0, maxWidth = Infinity, maxHeight = Infinity }: ScreenQuery,
  { width, height }: Pick<ScaledPage, "width" | "height">
) => width >= minWidth && width <= maxWidth && height <= maxHeight;

/*
 * CSS rules for one screen size: an @media rule. On a scaled page, the rules
 * themselves when the frame size matches the query, else nothing.
 */
export function screenRules(query: ScreenQuery, rules: string, scaledPage: ScaledPage | null) {
  if (!scaledPage) return `@media ${screenQueryText(query)} {${rules}}`;
  return matchesScreenQuery(query, scaledPage) ? rules : "";
}

/*
 * A viewport length, such as 70vh. On a scaled page, viewport units measure
 * the 320 px page, so use the same share of the frame size in px.
 */
export function viewportLength(percent: number, unit: "vw" | "vh", scaledPage: ScaledPage | null) {
  if (!scaledPage) return `${percent}${unit}`;
  const size = unit === "vw" ? scaledPage.width : scaledPage.height;
  return `${Math.round(percent * size) / 100}px`;
}
