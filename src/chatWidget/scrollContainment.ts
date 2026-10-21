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
