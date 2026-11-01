/*
 * The open chat window can cover the whole trigger (the launcher):
 * - on a short screen, 640 x 420 px or less, such as a desktop window at
 *   400 % zoom, the window fills the visible height (ChatWindow);
 * - while the on-screen keyboard is open on a phone, the window ends at the
 *   keyboard;
 * - a site can raise the trigger above the window (bottom_offset), or move
 *   it (setTriggerPosition).
 * The window always paints over the trigger: it is in the browser's top
 * layer, or above the trigger anchor in the widget root. Tab would then
 * reach a launcher that the visitor cannot see (WCAG 2.4.11). ChatWidget
 * takes the trigger out of the tab order, and the window header shows its
 * close button. Escape also closes the chat.
 *
 * The check compares the boxes on the screen. So it follows every window
 * layout, the site's mobile_chat_window_style and a moved trigger, without a
 * copy of the window CSS.
 */
import { RefObject, useLayoutEffect, useState } from "react";
import { subscribeVisualViewport } from "./utils";

/**
 * True when the box `outer` holds the whole box `inner`, with half a pixel
 * for rounding. An empty box holds nothing, and nothing holds it: a hidden
 * trigger (chat_trigger_style display: none) is never covered.
 */
export function holdsBox(outer: DOMRect, inner: DOMRect): boolean {
  if (outer.width <= 0 || outer.height <= 0 || inner.width <= 0 || inner.height <= 0) return false;
  return outer.left <= inner.left + 0.5 && outer.top <= inner.top + 0.5 &&
    outer.right >= inner.right - 0.5 && outer.bottom >= inner.bottom - 0.5;
}

/**
 * True when the card of the open window holds the whole trigger box.
 * - layerRef: the window layer of ChatWidget. The card is the .cl-window in
 *   its .cl-chat-window: the part that the visitor sees. On a phone, the
 *   .cl-chat-window has transparent paddings for the safe areas.
 * - placement: a text that changes when the trigger moves without a resize,
 *   such as with setTriggerPosition.
 * The check runs when the chat opens, before the first open frame is
 * painted, when the window has risen into place, after each resize and each
 * scroll of the visible area, and after a size change of the card or the
 * trigger. The value stays through the render that closes the chat, so that
 * the header keeps its close button while the focus goes back. The caller
 * takes the trigger back into the tab order in that render (open && covers).
 */
export function useWindowCoversTrigger(
  open: boolean,
  layerRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  placement = "",
): boolean {
  const [covers, setCovers] = useState(false);
  useLayoutEffect(() => {
    const chatWindow = open ? layerRef.current?.querySelector<HTMLElement>(".cl-chat-window") : null;
    const card = chatWindow?.querySelector<HTMLElement>(".cl-window");
    const trigger = triggerRef.current;
    if (!chatWindow || !card || !trigger) {
      setCovers(false);
      return;
    }
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      setCovers(holdsBox(card.getBoundingClientRect(), trigger.getBoundingClientRect()));
    };
    // In the next frame: the other listeners of a change move the window and the trigger first.
    const schedule = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(update);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    observer?.observe(card);
    observer?.observe(trigger);
    // The window rises into place as it opens. A transition inside it, such
    // as a button colour, does not move it.
    const afterRise = (event: Event) => {
      if (event.target === chatWindow) schedule();
    };
    chatWindow.addEventListener("transitionend", afterRise);
    chatWindow.addEventListener("transitioncancel", afterRise);
    const stop = subscribeVisualViewport(schedule);
    return () => {
      stop();
      observer?.disconnect();
      chatWindow.removeEventListener("transitionend", afterRise);
      chatWindow.removeEventListener("transitioncancel", afterRise);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [open, layerRef, triggerRef, placement]);
  return covers;
}
