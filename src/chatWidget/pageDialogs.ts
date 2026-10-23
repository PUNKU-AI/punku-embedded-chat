/*
 * A modal dialog or a consent dialog of the page stays above the widget.
 *
 * The widget stacks at 2147483000 to stay above floating chat buttons. Many
 * consent tools and site dialogs use lower values, for example Borlabs Cookie
 * (999999), so the trigger, the hint and the open window would cover the
 * dialog and its buttons. A visitor must be able to answer such a dialog.
 *
 * While one of these is visible, the widget takes a z-index just below its
 * layer:
 * - a dialog marked aria-modal="true" or role="alertdialog" (Borlabs Cookie);
 * - a dialog (role="dialog") whose name, id or class says cookie, consent,
 *   privacy or Datenschutz (CookieScript: "Cookie consent dialog");
 * - a fixed backdrop over the whole screen with such a word in its id or
 *   class (the Contao privacy opt-in, div.privacy_overlay, has no marks).
 * A floating WhatsApp button or a greeting bubble is none of these: the
 * widget stays above it.
 */
import { useEffect, useState } from "react";

const BLOCKING_DIALOGS = '[aria-modal="true"], [role="alertdialog"]';
const CONSENT_WORDS = ["cookie", "consent", "privacy", "datenschutz", "gdpr", "dsgvo"];
const CONSENT_PATTERN = new RegExp(CONSENT_WORDS.join("|"), "i");
// Lower case and capitalised, without the "i" flag of attribute selectors.
const CONSENT_NAMED = CONSENT_WORDS
  .flatMap((word) => [word, word[0].toUpperCase() + word.slice(1)])
  .flatMap((word) => [`[id*="${word}"]`, `[class*="${word}"]`])
  .join(", ");

/** How often the widget looks for a dialog: consent tools add theirs after the page loads. */
export const PAGE_DIALOG_CHECK_MS = 1000;

/**
 * The z-index of the layer that holds `element` on the page: the outermost
 * positioned ancestor with a z-index. null when no ancestor sets one.
 */
export function pageLayerZIndex(element: Element): number | null {
  let zIndex: number | null = null;
  for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    const value = parseInt(style.zIndex, 10);
    // An empty position (jsdom) is static, the same as in a browser.
    const positioned = style.position !== "" && style.position !== "static";
    if (positioned && Number.isFinite(value)) zIndex = value;
  }
  return zIndex;
}

/** True when `element` shows on the screen: a box in the viewport, not hidden, not transparent. */
function isShown(element: Element): boolean {
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.right <= 0 ||
      box.top >= window.innerHeight || box.left >= window.innerWidth) return false;
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  }
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  }
  return true;
}

/** The id, the class and the accessible name of an element. */
function names(element: Element): string {
  const labelledBy = (element.getAttribute("aria-labelledby") || "").split(/\s+/)
    .map((id) => (id && document.getElementById(id)?.textContent) || "");
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

/** The dialogs, consent dialogs and consent backdrops on the page (visible or not). */
function blockingElements(): Element[] {
  const consentDialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
    .filter((dialog) => CONSENT_PATTERN.test(names(dialog)));
  const consentBackdrops = Array.from(document.querySelectorAll(CONSENT_NAMED)).filter(coversScreen);
  return [...Array.from(document.querySelectorAll(BLOCKING_DIALOGS)), ...consentDialogs, ...consentBackdrops];
}

/** The highest layer z-index of a visible blocking dialog on the page, or null. */
export function blockingDialogZIndex(): number | null {
  let highest: number | null = null;
  for (const dialog of blockingElements()) {
    // The widget's own dialogs (the checkout) stack inside the widget root.
    // The closed shadow root hides them, but not in a page without it.
    if (dialog.closest(".cl-widget-root") || !isShown(dialog)) continue;
    const zIndex = pageLayerZIndex(dialog);
    if (zIndex !== null && (highest === null || zIndex > highest)) highest = zIndex;
  }
  return highest;
}

/** The widget's z-index: just below a blocking dialog that it would cover. */
export function belowBlockingDialog(zIndex: number, dialogZIndex: number | null): number {
  return dialogZIndex !== null && dialogZIndex <= zIndex ? Math.max(dialogZIndex - 1, 0) : zIndex;
}

/** The layer z-index of a visible blocking dialog, checked once a second. */
export function useBlockingDialogZIndex(): number | null {
  const [zIndex, setZIndex] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setZIndex(blockingDialogZIndex());
    update();
    const timer = window.setInterval(update, PAGE_DIALOG_CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return zIndex;
}
