/** Follow layout containers across the widget's closed shadow root. */
function ancestorsOf(element: Element): Element[] {
  const ancestors: Element[] = [];
  let current: Element | null = element;
  while (current) {
    ancestors.push(current);
    current = current.parentElement ?? (current.getRootNode() as ShadowRoot).host ?? null;
  }
  return ancestors;
}

export function isClosedWidgetHintVisible(trigger: HTMLButtonElement): boolean {
  if (!trigger.isConnected || document.visibilityState === "hidden") return false;
  const bounds = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  if (bounds.width <= 0 || bounds.height <= 0 || bounds.right <= left || bounds.bottom <= top ||
      bounds.left >= left + (viewport?.width ?? window.innerWidth) ||
      bounds.top >= top + (viewport?.height ?? window.innerHeight)) return false;

  return ancestorsOf(trigger).every((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" &&
      style.visibility !== "collapse" && style.opacity !== "0";
  });
}

/** Watch only the trigger and its containers, rather than all page mutations. */
export function observeClosedWidgetHintVisibility(
  trigger: HTMLButtonElement,
  onVisibility: (visible: boolean) => void
): () => void {
  let frame: number | undefined;
  let stopped = false;
  const update = () => {
    frame = undefined;
    if (!stopped) onVisibility(isClosedWidgetHintVisible(trigger));
  };
  const schedule = () => {
    if (!stopped && frame === undefined) frame = window.requestAnimationFrame(update);
  };
  const ancestors = ancestorsOf(trigger);
  const mutations = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(schedule);
  for (const element of ancestors) {
    mutations?.observe(element, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
    element.addEventListener("transitionend", schedule);
    element.addEventListener("animationend", schedule);
  }
  const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
  resize?.observe(trigger);
  const intersection = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(schedule);
  intersection?.observe(trigger);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);
  document.addEventListener("visibilitychange", schedule);
  update();

  return () => {
    stopped = true;
    mutations?.disconnect();
    resize?.disconnect();
    intersection?.disconnect();
    for (const element of ancestors) {
      element.removeEventListener("transitionend", schedule);
      element.removeEventListener("animationend", schedule);
    }
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule, true);
    window.visualViewport?.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("scroll", schedule);
    document.removeEventListener("visibilitychange", schedule);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
  };
}
