const HINT_MARGIN = 8;
const HINT_GAP = 12;

export type ClosedWidgetHintLayout = {
  positionClass: string;
  scrollText: boolean;
};

const setStyle = (element: HTMLElement, property: string, value: string) => {
  if (element.style.getPropertyValue(property) !== value) {
    element.style.setProperty(property, value);
  }
};

const pixels = (value: number) => `${Math.round(value * 100) / 100}px`;

/** Keep the preferred hint placement when the viewport has room. */
export function layoutClosedWidgetHint(
  hint: HTMLDivElement,
  trigger: HTMLButtonElement,
  preferredPositionClass: string
): ClosedWidgetHintLayout | null {
  const anchor = hint.parentElement?.getBoundingClientRect();
  const triggerBounds = trigger.getBoundingClientRect();
  // JSDOM and detached elements have no layout to correct.
  if (!anchor || !triggerBounds.width || !triggerBounds.height) return null;

  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const minimumX = (viewport?.offsetLeft ?? 0) + HINT_MARGIN;
  const minimumY = (viewport?.offsetTop ?? 0) + HINT_MARGIN;
  const availableWidth = Math.max(0, viewportWidth - HINT_MARGIN * 2);
  const availableHeight = Math.max(0, viewportHeight - HINT_MARGIN * 2);
  const maximumX = minimumX + availableWidth;
  const maximumY = minimumY + availableHeight;
  const style = getComputedStyle(hint);
  const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const textHeight = Math.max(0, availableHeight - verticalPadding);
  const text = hint.querySelector<HTMLElement>(".cl-closed-widget-hint-text");

  setStyle(hint, "max-width", pixels(Math.min(320, availableWidth, Math.max(0, viewportWidth - 96))));
  setStyle(hint, "max-height", pixels(availableHeight));
  setStyle(hint, "--cl-closed-hint-text-max-height", pixels(textHeight));

  const naturalTextHeight = text ? text.scrollHeight : hint.scrollHeight - verticalPadding;
  const scrollText = naturalTextHeight > textHeight + 1;
  const bounds = hint.getBoundingClientRect();
  const width = Math.min(bounds.width, availableWidth);
  const height = Math.min(bounds.height, availableHeight);
  let positionClass = preferredPositionClass;
  const leftAligned = positionClass.endsWith("-left");
  const sidePosition = positionClass === "cl-hint-left" || positionClass === "cl-hint-right";

  if (!sidePosition) {
    const above = positionClass.startsWith("cl-hint-top");
    const aboveSpace = anchor.top - HINT_GAP - minimumY;
    const belowSpace = maximumY - anchor.bottom - HINT_GAP;
    const preferredSpace = above ? aboveSpace : belowSpace;
    const otherSpace = above ? belowSpace : aboveSpace;
    if (preferredSpace < height && otherSpace > preferredSpace) {
      positionClass = `cl-hint-${above ? "bottom" : "top"}${leftAligned ? "-left" : ""}`;
    }
  }

  let x: number;
  let y: number;
  if (sidePosition) {
    x = positionClass === "cl-hint-left" ? anchor.left - HINT_GAP - width : anchor.right + HINT_GAP;
    y = anchor.top + (anchor.height - height) / 2;
  } else {
    x = leftAligned ? anchor.left : anchor.right - width;
    y = positionClass.startsWith("cl-hint-top") ? anchor.top - HINT_GAP - height : anchor.bottom + HINT_GAP;
  }

  x = Math.max(minimumX, Math.min(x, maximumX - width));
  y = Math.max(minimumY, Math.min(y, maximumY - height));
  // Coordinates come from the anchor, never from an earlier hint correction.
  setStyle(hint, "left", pixels(x - anchor.left));
  setStyle(hint, "top", pixels(y - anchor.top));
  setStyle(hint, "right", "auto");
  setStyle(hint, "bottom", "auto");
  setStyle(hint, "transform", "none");
  setStyle(hint, "--cl-closed-hint-arrow-y", pixels(Math.max(8, Math.min(triggerBounds.top + triggerBounds.height / 2 - y, height - 8))));
  return { positionClass, scrollText };
}
