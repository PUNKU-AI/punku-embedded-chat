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
 *
 * Some pages open the chat a moment after the click. A live page fades its
 * chat notice out and calls api.open() 200 ms after the visitor's Accept.
 * So a click, or Enter or Space, also counts for VISITOR_ACTION_MS when the
 * control that the visitor pressed showed then and has left the page or is
 * hidden by now (its notice or menu closed), or when it is a chat toggle of
 * the page (HOST_TOGGLE_SELECTOR). A press on a control that stays, such as a
 * link in the text, does not: a page timer after it still leaves the focus on
 * the page. The next press or key ends the time, and a page field that has
 * the focus keeps it.
 */

// A page button that opens and closes the widget through the global API.
// A press on it is not a click outside: the button closes the widget itself.
// data-punku-handler is the mark of the Swarovski page script.
export const HOST_TOGGLE_SELECTOR = "[data-punku-chat-toggle], [data-punku-handler]";

// The input events that a click, a tap or a key press dispatches. Only the
// browser sets isTrusted: a script's dispatchEvent() is no visitor action.
const VISITOR_INPUT_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchend", "click", "keydown", "keyup"];

// The events of a new press or key press: they end the time of the press
// before them. The release of a press (pointerup, mouseup, touchend, keyup)
// belongs to that press.
const NEW_INPUT_EVENTS = new Set(["pointerdown", "mousedown", "keydown"]);

// The keys that press a control. A browser sends them on a native button as a
// click after the keydown. A scripted button (role="button") gets only the keydown.
const ACTIVATION_KEYS = new Set(["Enter", " "]);

/**
 * How long a press still counts when its control has gone since, or when it
 * is a chat toggle of the page. A live page opens the chat 214 to 229 ms
 * after the click. One second leaves room for a busy phone.
 */
export const VISITOR_ACTION_MS = 1000;

const NO_TEXT_INPUTS = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"]);

/** A field that takes text, and so opens the on-screen keyboard with the focus. */
export const takesText = (element: HTMLElement) =>
  element.isContentEditable ||
  element instanceof HTMLTextAreaElement ||
  (element instanceof HTMLInputElement && !NO_TEXT_INPUTS.has(element.type));

/**
 * An element that takes the visitor's keys: a text field, a list box or
 * editable content. Also a frame: the page cannot see what the visitor does
 * in it.
 */
export const takesKeys = (element: Element | null | undefined) =>
  element instanceof HTMLElement &&
  (takesText(element) || element instanceof HTMLSelectElement || element instanceof HTMLIFrameElement);

let handlingVisitorInput = false;
// The visitor's last press: when, on which element, and whether on a chat toggle of the page.
let lastPress: { at: number; target: Element; toggle: boolean } | null = null;
let watchers = 0;

// The elements that an event passes, from its target out. In a page
// component (an open shadow root) the target is the inner element. An event
// from a closed shadow root names its host.
function eventPath(event: Event): Element[] {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
  return path.filter((node): node is Element => node instanceof Element);
}

// True when the element has left the page, or shows nothing on it.
function goneOrHidden(element: Element) {
  if (!element.isConnected || element.getClientRects().length === 0) return true;
  return typeof element.checkVisibility === "function" &&
    !element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
}

// A click, or Enter or Space, starts the time on a control that shows on the
// page. Not in a page field: the visitor types there. Not on a control that
// does not show, such as the hidden native input of a custom switch: it would
// count at once. Each other new press or key ends the time: the visitor moved on.
function notePress(event: Event) {
  const presses = event.type === "click" ||
    (event.type === "keydown" && ACTIVATION_KEYS.has((event as KeyboardEvent).key));
  if (presses) {
    const path = eventPath(event);
    const target = path[0];
    lastPress = target && !takesKeys(target) && !goneOrHidden(target)
      ? { at: performance.now(), target, toggle: path.some((element) => element.matches(HOST_TOGGLE_SELECTOR)) }
      : null;
  } else if (NEW_INPUT_EVENTS.has(event.type)) {
    lastPress = null;
  }
}

/** Marks the task that dispatches a trusted input event. The window's capture listener calls it. */
export function noteVisitorInput(event: Event) {
  if (!event.isTrusted) return;
  notePress(event);
  if (handlingVisitorInput) return;
  handlingVisitorInput = true;
  setTimeout(() => {
    handlingVisitorInput = false;
  }, 0);
}

/**
 * True while the page handles a click, a tap or a key press of the visitor.
 * Also up to VISITOR_ACTION_MS after a press on a control that has left the
 * page or is hidden since, or on a chat toggle of the page. Then not when
 * `focused`, the page element with the focus, takes keys: the visitor may
 * type there by now.
 */
export function isVisitorAction(focused: Element | null = null) {
  if (handlingVisitorInput) return true;
  if (!lastPress) return false;
  // A clock that starts again, as a test's fake clock does, counts as no time.
  const elapsed = performance.now() - lastPress.at;
  if (elapsed < 0 || elapsed > VISITOR_ACTION_MS || takesKeys(focused)) return false;
  return lastPress.toggle || goneOrHidden(lastPress.target);
}

/** Watches the visitor's input while a widget is on the page. Returns a function that stops it. */
export function watchVisitorInput() {
  if (watchers++ === 0) {
    for (const type of VISITOR_INPUT_EVENTS) window.addEventListener(type, noteVisitorInput, true);
  }
  return () => {
    if (--watchers > 0) return;
    for (const type of VISITOR_INPUT_EVENTS) window.removeEventListener(type, noteVisitorInput, true);
    // No widget is left to open: forget the visitor's input.
    handlingVisitorInput = false;
    lastPress = null;
  };
}
