/**
 * Keep wheel and touch scrolling inside `element` instead of letting a
 * host-page smooth-scroll library (Lenis, Locomotive, GSAP ScrollSmoother, …)
 * hijack it. The widget renders in a closed shadow root, so the host page
 * cannot reach the element to opt out, but wheel/touchmove events are composed
 * and bubble out to `window`, where those libraries listen. Stopping the
 * propagation keeps native scrolling of the element working while preventing
 * the page from scrolling instead. See the fix for reps.energy (Lenis).
 *
 * Returns the cleanup function, so it can be returned from a `useEffect`.
 */
export function containScrollEvents(element: HTMLElement | null): () => void {
  if (!element) return () => {};
  const stopScrollPropagation = (event: Event) => event.stopPropagation();
  element.addEventListener("wheel", stopScrollPropagation, { passive: true });
  element.addEventListener("touchmove", stopScrollPropagation, { passive: true });
  return () => {
    element.removeEventListener("wheel", stopScrollPropagation);
    element.removeEventListener("touchmove", stopScrollPropagation);
  };
}

const SCROLLS = /auto|scroll|overlay/;
// A finger moves this far before the browser starts to scroll. Moves inside
// it stay with the browser, and the first move past it decides the gesture.
const DIRECTION_SLOP = 6;
// Below this vertical movement, the finger's vertical direction is not known
// yet. The gesture is decided at the latest when it has moved DECIDE_BY px.
const VERTICAL_SLOP = 3;
const DECIDE_BY = 10;

/*
 * True if the touched element, an ancestor up to `boundary`, or `boundary`
 * itself can scroll by a finger move of (dx, dy) on either axis. A field
 * counts only when its own text scrolls.
 */
function touchCanScroll(target: EventTarget | null, boundary: HTMLElement, dx: number, dy: number) {
  for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    // A finger that moves down or right shows the content above or on the left.
    if (dy !== 0 && SCROLLS.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      if (dy > 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
    }
    if (dx !== 0 && SCROLLS.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
      const left = Math.abs(node.scrollLeft);
      if (dx > 0 ? left > 0 : left + node.clientWidth < node.scrollWidth - 1) return true;
    }
    if (node === boundary) break;
  }
  return false;
}

/**
 * Keep touch scrolling that starts in `element` inside it. A drag on a part
 * that cannot scroll (the header, the bar under the messages, a field whose
 * text fits), or past the end of the message list, scrolled the host page
 * behind the window. With the on-screen keyboard open, it also panned the
 * visible part of the page, and the window followed one frame late: it
 * jumped. Scrolling the message list and other scrolling parts, and pinch
 * zoom (two fingers) keep working.
 *
 * The first move past DIRECTION_SLOP decides the whole gesture, from the
 * movement since the touch started. On iOS, a cancelled touchmove stops
 * scrolling for the rest of the touch, so a single sideways sample at the
 * start of a flick must not decide it. The gesture scrolls if either axis of
 * the movement can scroll something. Else every move of it is cancelled.
 * While the finger has moved less than VERTICAL_SLOP up or down, both
 * vertical directions are checked: if they agree (nothing scrolls on the
 * header, the list scrolls both ways in its middle), the gesture is decided.
 * Else (the list at its end) it waits, without a cancel, until the vertical
 * direction is known or the finger has moved DECIDE_BY px.
 *
 * Returns the cleanup function, so it can be returned from a `useEffect`.
 */
export function keepTouchScrollInside(element: HTMLElement | null): () => void {
  if (!element) return () => {};
  let start: { x: number; y: number } | null = null;
  let scrolls: boolean | null = null;
  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    start = touch ? { x: touch.clientX, y: touch.clientY } : null;
    scrolls = null;
  };
  const handleTouchMove = (event: TouchEvent) => {
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    if (!touch || !start) return;
    if (scrolls === null) {
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const moved = Math.max(Math.abs(dx), Math.abs(dy));
      if (moved < DIRECTION_SLOP) return;
      if (Math.abs(dy) < VERTICAL_SLOP && moved < DECIDE_BY) {
        const down = touchCanScroll(event.target, element, dx, 1);
        if (down !== touchCanScroll(event.target, element, dx, -1)) return;
        scrolls = down;
      } else {
        scrolls = touchCanScroll(event.target, element, dx, dy);
      }
    }
    if (!scrolls && event.cancelable) event.preventDefault();
  };
  // Capture: the message list and the input stop touchmove from bubbling
  // (containScrollEvents), and this check must see the moves there too.
  element.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
  element.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });
  return () => {
    element.removeEventListener("touchstart", handleTouchStart, { capture: true });
    element.removeEventListener("touchmove", handleTouchMove, { capture: true });
  };
}
