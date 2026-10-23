/*
 * A modal dialog or a consent dialog of the page stays above the widget.
 *
 * The open window goes to the browser's top layer, above every z-index of
 * the page (see ChatWidget). It would then cover a consent dialog and its
 * buttons. A visitor must be able to answer such a dialog.
 *
 * While one of these is visible, the window stays in the page. The widget
 * stays below the dialog's layer, and goes just below it when that layer is
 * lower than the widget's own z-index:
 * - a dialog marked aria-modal="true" or role="alertdialog" (Borlabs Cookie);
 * - a dialog (role="dialog") whose name, id or class says cookie, consent,
 *   privacy or Datenschutz (CookieScript: "Cookie consent dialog");
 * - a fixed backdrop over the whole screen with such a word in its id or
 *   class (the Contao privacy opt-in, div.privacy_overlay, has no marks);
 * - a native <dialog> opened with showModal(), also without these marks.
 *   It is in the browser's top layer. A popover that opens later goes above
 *   it, so the window must stay out of the top layer.
 * The search also covers the open shadow roots of the body's children:
 * Usercentrics draws its dialog in the shadow root of
 * aside#usercentrics-cmp-ui (Swarovski). A floating WhatsApp button or a
 * greeting bubble is none of these: the widget stays above it.
 */
import { useEffect, useState } from "react";

const BLOCKING_DIALOGS = '[aria-modal="true"], [role="alertdialog"]';
const CONSENT_WORDS = ["cookie", "consent", "privacy", "datenschutz", "gdpr", "dsgvo"];
const CONSENT_PATTERN = new RegExp(CONSENT_WORDS.join("|"), "i");
// Lower case, capitalised and upper case (GDPR), without the "i" flag of
// attribute selectors. This file does not use flatMap: the bundle must keep
// working in browsers without it (Safari 11).
const CONSENT_NAMED = CONSENT_WORDS
  .map((word) => [word, word[0].toUpperCase() + word.slice(1), word.toUpperCase()]
    .map((name) => `[id*="${name}"], [class*="${name}"]`).join(", "))
  .join(", ");

/** How often the widget looks for a dialog: consent tools add theirs after the page loads. */
export const PAGE_DIALOG_CHECK_MS = 1000;

/** The layer of an element in the top layer: above every z-index of the page. */
export const TOP_LAYER_Z_INDEX = Number.MAX_SAFE_INTEGER;

/**
 * element.matches(selector). False for a selector that the browser does not
 * know: :modal needs Safari 15.6 and Firefox 103, :popover-open needs Safari
 * 17 and Firefox 125. Such a browser has no popover, so the window stays in
 * the page there anyway.
 */
function matchesSelector(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

/** A computed value that is set and not the initial value (jsdom leaves many empty). */
const isSet = (value: string | undefined, initial: string) => !!value && value !== initial;

/** The parent of `node`. The top element of a shadow root has the shadow host as its parent. */
function parentOf(node: Element): Element | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/**
 * The z-index at which `node` makes a stacking context, or null when it makes
 * none. A context from opacity, transform, filter and similar properties sits
 * at 0.
 */
function stackingContextZIndex(node: Element): number | null {
  const style = window.getComputedStyle(node);
  const value = parseInt(style.zIndex, 10);
  const hasZIndex = Number.isFinite(value);
  // An empty position (jsdom) is static, the same as in a browser.
  if (style.position === "fixed" || style.position === "sticky") return hasZIndex ? value : 0;
  if (hasZIndex && isSet(style.position, "static")) return value;
  const parent = parentOf(node);
  const parentDisplay = parent ? window.getComputedStyle(parent).display : "";
  if (hasZIndex && /(^|-)(flex|grid)$/.test(parentDisplay)) return value;
  if ((style.opacity !== "" && Number(style.opacity) < 1) || isSet(style.transform, "none") ||
      isSet(style.filter, "none") || isSet(style.backdropFilter, "none") || isSet(style.clipPath, "none") ||
      isSet(style.perspective, "none") || isSet(style.mixBlendMode, "normal") || style.isolation === "isolate" ||
      /transform|opacity|filter|perspective/.test(style.willChange || "") ||
      /paint|layout|strict|content/.test(style.contain || "")) return 0;
  return null;
}

/**
 * The z-index of the layer that holds `element` on the page: the z-index of
 * its outermost stacking context below <body>. null when it has none.
 */
export function pageLayerZIndex(element: Element): number | null {
  let zIndex: number | null = null;
  for (let node: Element | null = element; node && node !== document.body && node !== document.documentElement;
    node = parentOf(node)) {
    const level = stackingContextZIndex(node);
    if (level !== null) zIndex = level;
  }
  return zIndex;
}

/** True when `element` or an ancestor is in the top layer: a modal dialog or an open popover. */
function inTopLayer(element: Element): boolean {
  for (let node: Element | null = element; node; node = parentOf(node)) {
    if (matchesSelector(node, ":modal") || matchesSelector(node, ":popover-open")) return true;
  }
  return false;
}

/** True when `element` shows on the screen: a box in the viewport, not hidden, not transparent. */
function isShown(element: Element): boolean {
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.right <= 0 ||
      box.top >= window.innerHeight || box.left >= window.innerWidth) return false;
  // TypeScript 4.9 does not know checkVisibility.
  const visibility = element as Element & { checkVisibility?: (options: object) => boolean };
  if (typeof visibility.checkVisibility === "function") {
    return visibility.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  }
  for (let node: Element | null = element; node; node = parentOf(node)) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  }
  return true;
}

/** The id, the class and the accessible name of an element. */
function names(element: Element): string {
  // aria-labelledby refers to ids in the element's own document or shadow root.
  const root = element.getRootNode() as Document | ShadowRoot;
  const labelledBy = (element.getAttribute("aria-labelledby") || "").split(/\s+/)
    .map((id) => (id && root.getElementById(id)?.textContent) || "");
  return [element.id, element.getAttribute("class") || "", element.getAttribute("aria-label") || "", ...labelledBy].join(" ");
}

/**
 * A fixed element over (almost) the whole screen, such as the backdrop of a
 * dialog. A scrollbar or a phone's toolbar can make it a little smaller than
 * the window.
 */
function coversScreen(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return box.width >= window.innerWidth * 0.9 && box.height >= window.innerHeight * 0.75 &&
    window.getComputedStyle(element).position === "fixed";
}

/**
 * The document and the open shadow roots of the body's children. Consent
 * tools add their host to the body. The widget's own shadow root is closed.
 */
function searchRoots(): Array<Document | ShadowRoot> {
  const shadowRoots = Array.from(document.body.children)
    .map((child) => child.shadowRoot)
    .filter((root): root is ShadowRoot => root !== null);
  return [document, ...shadowRoots];
}

/** The dialogs, consent dialogs and consent backdrops on the page (visible or not). */
function blockingElements(): Element[] {
  const elements: Element[] = [];
  for (const root of searchRoots()) {
    const consentDialogs = Array.from(root.querySelectorAll('[role="dialog"]'))
      .filter((dialog) => CONSENT_PATTERN.test(names(dialog)));
    const consentBackdrops = Array.from(root.querySelectorAll(CONSENT_NAMED)).filter(coversScreen);
    const modalDialogs = Array.from(root.querySelectorAll("dialog[open]"))
      .filter((dialog) => matchesSelector(dialog, ":modal"));
    elements.push(...Array.from(root.querySelectorAll(BLOCKING_DIALOGS)), ...consentDialogs, ...consentBackdrops,
      ...modalDialogs);
  }
  return elements;
}

/**
 * The lowest layer z-index of the visible blocking dialogs on the page, or
 * null. The widget must stay below each of them: the Contao opt-in has its
 * backdrop at 10000000 and its box at 20000000.
 */
export function blockingDialogZIndex(): number | null {
  let lowest: number | null = null;
  for (const dialog of blockingElements()) {
    // The widget's own dialogs stack inside the widget root. The closed
    // shadow root hides them, but not in a page without it.
    if (dialog.closest(".cl-widget-root") || !isShown(dialog)) continue;
    const zIndex = inTopLayer(dialog) ? TOP_LAYER_Z_INDEX : pageLayerZIndex(dialog);
    if (zIndex !== null && (lowest === null || zIndex < lowest)) lowest = zIndex;
  }
  return lowest;
}

/**
 * The widget's z-index: just below a blocking dialog that it would cover.
 * A dialog in a layer at 0 or lower puts the widget below 0. An equal
 * z-index lets the page order decide, and the widget can come after the
 * dialog. Below 0, the page content also covers the widget until the visitor
 * answers the dialog.
 */
export function belowBlockingDialog(zIndex: number, dialogZIndex: number | null): number {
  return dialogZIndex !== null && dialogZIndex <= zIndex ? dialogZIndex - 1 : zIndex;
}

/** The layer z-index of a visible blocking dialog, checked once a second. */
export function useBlockingDialogZIndex(): number | null {
  // The first check runs in the first render: a window that starts open must
  // not show above a dialog that is already there, not even for one frame.
  const [zIndex, setZIndex] = useState<number | null>(blockingDialogZIndex);
  useEffect(() => {
    const update = () => setZIndex(blockingDialogZIndex());
    update();
    const timer = window.setInterval(update, PAGE_DIALOG_CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return zIndex;
}
