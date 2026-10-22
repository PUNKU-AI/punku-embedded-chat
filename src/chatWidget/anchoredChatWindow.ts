/*
 * Place the chat window next to a trigger that the host page moved with
 * setTriggerPosition. The window is a fixed box with an inline top and left,
 * so the placement must use the size that the window renders at.
 */
import { RefObject, useLayoutEffect, useState } from "react";

export type ViewportSize = { width: number; height: number };

// The trigger position (x, y) and its rendered size.
export type AnchoredTrigger = { x: number; y: number; width?: number; height?: number };

export type AnchorMetrics = {
  viewport: ViewportSize;
  triggerSize: { width: number; height: number };
};

export type AnchoredChatWindowPlacement = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export const DEFAULT_TRIGGER_SIZE = 48;
export const VIEWPORT_MARGIN = 16;
const DEFAULT_CHAT_WINDOW_WIDTH = 450;
const DEFAULT_CHAT_WINDOW_HEIGHT = 650;
const ANCHORED_CHAT_WINDOW_GAP = 32;
// The short landscape layout also keeps 12 px between window and trigger.
const ANCHORED_CHAT_WINDOW_SIDE_GAP = 12;

// Breakpoints of the responsive rules in chatWindow/index.tsx.
const PHONE_LAYOUT_MAX_WIDTH = 640;
const SMALL_TABLET_LAYOUT_MAX_WIDTH = 767;
const DESKTOP_LAYOUT_MIN_WIDTH = 1024;

const getPositiveNumber = (value: number | undefined, fallback: number) =>
  typeof value === "number" && isFinite(value) && value > 0 ? value : fallback;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

export const getViewportSize = (): ViewportSize => ({
  width: typeof window === "undefined" ? 1024 : window.innerWidth,
  height: typeof window === "undefined" ? 768 : window.innerHeight,
});

/*
 * From 641 to 1023 px wide, the CSS sets the window size and ignores the
 * width and height props.
 */
export const isTabletLayout = (viewportWidth: number) =>
  viewportWidth > PHONE_LAYOUT_MAX_WIDTH && viewportWidth < DESKTOP_LAYOUT_MIN_WIDTH;

/*
 * The size of the window. The tablet values are the CSS defaults of the
 * 641-767 px and 768-1023 px rules. An anchored window gets them through
 * --cl-anchored-window-width and --cl-anchored-window-height, so it renders
 * at this size also when 100vh is taller than the visible screen (mobile
 * browser toolbars). Rounded down to whole pixels.
 */
export const getChatWindowSize = (
  viewport: ViewportSize,
  chatWindowWidth?: number,
  chatWindowHeight?: number
): { width: number; height: number } => {
  const availableWidth = Math.max(0, viewport.width - VIEWPORT_MARGIN * 2);
  const availableHeight = Math.max(0, viewport.height - VIEWPORT_MARGIN * 2);

  if (isTabletLayout(viewport.width)) {
    const isSmallTablet = viewport.width <= SMALL_TABLET_LAYOUT_MAX_WIDTH;
    const width = isSmallTablet ? Math.min(420, viewport.width * 0.85) : Math.min(420, viewport.width * 0.6 - 10);
    const height = Math.min(600, viewport.height * (isSmallTablet ? 0.75 : 0.7));
    return {
      width: Math.floor(Math.min(width, availableWidth)),
      height: Math.floor(Math.min(height, availableHeight)),
    };
  }

  return {
    width: Math.min(
      getPositiveNumber(chatWindowWidth, DEFAULT_CHAT_WINDOW_WIDTH),
      availableWidth,
      viewport.width * 0.9
    ),
    height: Math.min(
      getPositiveNumber(chatWindowHeight, DEFAULT_CHAT_WINDOW_HEIGHT),
      availableHeight,
      viewport.height * 0.7
    ),
  };
};

// A trigger in the left half of the screen opens its window to the right.
export const isTriggerOnLeftSide = (trigger: AnchoredTrigger, viewport: ViewportSize) =>
  trigger.x + getPositiveNumber(trigger.width, DEFAULT_TRIGGER_SIZE) / 2 < viewport.width / 2;

export const getAnchoredChatWindowPlacement = (
  trigger: AnchoredTrigger,
  viewport: ViewportSize,
  chatWindowWidth?: number,
  chatWindowHeight?: number
): AnchoredChatWindowPlacement => {
  const size = getChatWindowSize(viewport, chatWindowWidth, chatWindowHeight);
  // chat_trigger_style and the host root font size (3rem) can change the trigger size.
  const triggerWidth = getPositiveNumber(trigger.width, DEFAULT_TRIGGER_SIZE);
  const triggerHeight = getPositiveNumber(trigger.height, DEFAULT_TRIGGER_SIZE);
  const maxTop = viewport.height - size.height - VIEWPORT_MARGIN;
  const maxLeft = viewport.width - size.width - VIEWPORT_MARGIN;
  const shouldOpenAbove = trigger.y + triggerHeight / 2 >= viewport.height / 2;
  const shouldAlignLeft = isTriggerOnLeftSide(trigger, viewport);
  let top = shouldOpenAbove
    ? trigger.y - ANCHORED_CHAT_WINDOW_GAP - size.height
    : trigger.y + triggerHeight + ANCHORED_CHAT_WINDOW_GAP;
  let left = shouldAlignLeft
    ? trigger.x
    : trigger.x + triggerWidth - size.width;

  /*
   * A short screen has no room above or below the trigger for the tablet
   * window, so the clamp below would put the window over the trigger.
   * Open the window beside the trigger instead, toward the screen center.
   */
  if (isTabletLayout(viewport.width) && (top < VIEWPORT_MARGIN || top > maxTop)) {
    const besideLeft = shouldAlignLeft
      ? trigger.x + triggerWidth + ANCHORED_CHAT_WINDOW_SIDE_GAP
      : trigger.x - ANCHORED_CHAT_WINDOW_SIDE_GAP - size.width;
    if (besideLeft >= VIEWPORT_MARGIN && besideLeft <= maxLeft) {
      left = besideLeft;
      top = shouldOpenAbove ? trigger.y + triggerHeight - size.height : trigger.y;
    }
  }

  return {
    top: Math.round(clamp(top, VIEWPORT_MARGIN, maxTop)),
    left: Math.round(clamp(left, VIEWPORT_MARGIN, maxLeft)),
    width: size.width,
    height: size.height,
  };
};

const readAnchorMetrics = (trigger: HTMLElement | null): AnchorMetrics => ({
  viewport: getViewportSize(),
  // offsetWidth and offsetHeight ignore transforms. 0 means no layout (tests).
  triggerSize: {
    width: trigger?.offsetWidth || DEFAULT_TRIGGER_SIZE,
    height: trigger?.offsetHeight || DEFAULT_TRIGGER_SIZE,
  },
});

const isSameMetrics = (first: AnchorMetrics, second: AnchorMetrics) =>
  first.viewport.width === second.viewport.width &&
  first.viewport.height === second.viewport.height &&
  first.triggerSize.width === second.triggerSize.width &&
  first.triggerSize.height === second.triggerSize.height;

/*
 * The viewport and the trigger size for the placement. While a trigger is
 * anchored, read them again after a resize, a rotation, a change of the
 * visible area (mobile browser toolbars) or a trigger size change. Without
 * this, the window keeps the place and the size of the old screen.
 */
export const useAnchorMetrics = (enabled: boolean, triggerRef: RefObject<HTMLElement>): AnchorMetrics => {
  const [metrics, setMetrics] = useState(() => readAnchorMetrics(null));

  useLayoutEffect(() => {
    if (!enabled) return;

    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      const next = readAnchorMetrics(triggerRef.current);
      setMetrics((previous) => (isSameMetrics(previous, next) ? previous : next));
    };
    const scheduleUpdate = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(update);
    };
    update();

    const trigger = triggerRef.current;
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(scheduleUpdate);
    if (trigger) observer?.observe(trigger);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [enabled, triggerRef]);

  return metrics;
};
