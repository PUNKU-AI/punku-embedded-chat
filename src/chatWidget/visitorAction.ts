/*
 * A visitor action: the visitor's own click, tap or key press. The chat
 * window takes the keyboard focus when it opens only after such an action
 * (WCAG 3.2.1): the launcher, or a page control that calls api.open() in the
 * handler of the visitor's event. A chat that opens with the page
 * (start_open), from a timer or after a network answer leaves the focus
 * where the visitor has it.
 *
 * The browser dispatches each input event in a task of its own. A listener on
 * the window in the capture phase runs before the page's own listeners, so
 * the mark is set while the page handles the event, and in the microtasks
 * that follow. A timeout clears it after that task.
 */

// The input events that a click, a tap or a key press dispatches. Only the
// browser sets isTrusted: a script's dispatchEvent() is no visitor action.
const VISITOR_INPUT_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchend", "click", "keydown", "keyup"];

let handlingVisitorInput = false;
let watchers = 0;

/** Marks the task that dispatches a trusted input event. The window's capture listener calls it. */
export function noteVisitorInput(event: Event) {
  if (!event.isTrusted || handlingVisitorInput) return;
  handlingVisitorInput = true;
  setTimeout(() => {
    handlingVisitorInput = false;
  }, 0);
}

/** True while the page handles a click, a tap or a key press of the visitor. */
export function isVisitorAction() {
  return handlingVisitorInput;
}

/** Watches the visitor's input while a widget is on the page. Returns a function that stops it. */
export function watchVisitorInput() {
  if (watchers++ === 0) {
    for (const type of VISITOR_INPUT_EVENTS) window.addEventListener(type, noteVisitorInput, true);
  }
  return () => {
    if (--watchers > 0) return;
    for (const type of VISITOR_INPUT_EVENTS) window.removeEventListener(type, noteVisitorInput, true);
  };
}
