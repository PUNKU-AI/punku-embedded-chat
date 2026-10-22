/*
 * Place the chat window next to a trigger that the host page moved with
 * setTriggerPosition. The window is a fixed box with an inline top and left,
 * so the placement must use the size that the window renders at.
 */

export type ViewportSize = { width: number; height: number };

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

export const getAnchoredChatWindowPlacement = (
  trigger: { x: number; y: number },
  viewport: ViewportSize,
  chatWindowWidth?: number,
  chatWindowHeight?: number
): AnchoredChatWindowPlacement => {
  const size = getChatWindowSize(viewport, chatWindowWidth, chatWindowHeight);
  const maxTop = viewport.height - size.height - VIEWPORT_MARGIN;
  const maxLeft = viewport.width - size.width - VIEWPORT_MARGIN;
  const triggerCenterX = trigger.x + DEFAULT_TRIGGER_SIZE / 2;
  const triggerCenterY = trigger.y + DEFAULT_TRIGGER_SIZE / 2;
  const shouldOpenAbove = triggerCenterY >= viewport.height / 2;
  const shouldAlignLeft = triggerCenterX < viewport.width / 2;
  let top = shouldOpenAbove
    ? trigger.y - ANCHORED_CHAT_WINDOW_GAP - size.height
    : trigger.y + DEFAULT_TRIGGER_SIZE + ANCHORED_CHAT_WINDOW_GAP;
  let left = shouldAlignLeft
    ? trigger.x
    : trigger.x + DEFAULT_TRIGGER_SIZE - size.width;

  /*
   * A short screen has no room above or below the trigger for the tablet
   * window, so the clamp below would put the window over the trigger.
   * Open the window beside the trigger instead, toward the screen center.
   */
  if (isTabletLayout(viewport.width) && (top < VIEWPORT_MARGIN || top > maxTop)) {
    const besideLeft = shouldAlignLeft
      ? trigger.x + DEFAULT_TRIGGER_SIZE + ANCHORED_CHAT_WINDOW_SIDE_GAP
      : trigger.x - ANCHORED_CHAT_WINDOW_SIDE_GAP - size.width;
    if (besideLeft >= VIEWPORT_MARGIN && besideLeft <= maxLeft) {
      left = besideLeft;
      top = shouldOpenAbove ? trigger.y + DEFAULT_TRIGGER_SIZE - size.height : trigger.y;
    }
  }

  return {
    top: Math.round(clamp(top, VIEWPORT_MARGIN, maxTop)),
    left: Math.round(clamp(left, VIEWPORT_MARGIN, maxLeft)),
    width: size.width,
    height: size.height,
  };
};
