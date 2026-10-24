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

/*
 * True if the touched element, an ancestor up to `boundary`, or `boundary`
 * itself can scroll by a finger move of (dx, dy). A field takes every move:
 * the visitor moves the caret or selects text there.
 */
function touchCanScroll(target: EventTarget | null, boundary: HTMLElement, dx: number, dy: number) {
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const move = vertical ? dy : dx;
  if (move === 0) return true;
  for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
    if (node instanceof HTMLElement && (node.isContentEditable || node.tagName === "TEXTAREA" || node.tagName === "INPUT")) {
      return true;
    }
    const style = getComputedStyle(node);
    // A finger that moves down or right shows the content above or on the left.
    if (vertical && SCROLLS.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      if (move > 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
    }
    if (!vertical && SCROLLS.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
      const left = Math.abs(node.scrollLeft);
      if (move > 0 ? left > 0 : left + node.clientWidth < node.scrollWidth - 1) return true;
    }
    if (node === boundary) break;
  }
  return false;
}

/**
 * Keep touch scrolling that starts in `element` inside it. A drag on a part
 * that cannot scroll (the header, the bar under the messages), or past the
 * end of the message list, scrolled the host page behind the window. With
 * the on-screen keyboard open, it also panned the visible part of the page,
 * and the window followed one frame late: it jumped. Scrolling the message
 * list and other scrolling parts, text editing in a field and pinch zoom
 * (two fingers) keep working. Only one-finger moves that nothing in
 * `element` can follow are cancelled.
 *
 * Returns the cleanup function, so it can be returned from a `useEffect`.
 */
export function keepTouchScrollInside(element: HTMLElement | null): () => void {
  if (!element) return () => {};
  let last: { x: number; y: number } | null = null;
  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    last = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handleTouchMove = (event: TouchEvent) => {
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    if (!touch || !last) return;
    const dx = touch.clientX - last.x;
    const dy = touch.clientY - last.y;
    last = { x: touch.clientX, y: touch.clientY };
    if (!event.cancelable || touchCanScroll(event.target, element, dx, dy)) return;
    event.preventDefault();
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
