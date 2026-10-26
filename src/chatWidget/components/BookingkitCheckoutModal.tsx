import React, { useEffect, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { revealInScrollContainer, trackVisualViewport, VISUAL_VIEWPORT_PROPERTIES } from "../utils";
import type { ScaledPage } from "../scaledPage";
import { Language, translations } from "../../translations";

interface BookingkitCheckoutModalProps {
  url: string | null;
  onClose: () => void;
  language: Language;
  returnFocusTo?: HTMLElement;
  /** A page that the browser scales up, such as Wix with width=320 (scaledPage.ts). */
  scaledPage?: ScaledPage | null;
}

const CHECKOUT_ORIGIN = "https://eu5.bookingkit.de";
const VISIBLE_LEFT = `var(${VISUAL_VIEWPORT_PROPERTIES.offsetLeft}, 0px)`;
const VISIBLE_TOP = `var(${VISUAL_VIEWPORT_PROPERTIES.offsetTop}, 0px)`;

/*
 * Insets for a screen-sized box at the visible part of the page (#77). The
 * box is 100vw x `screenHeight`, the size the dialog had before. Viewport
 * units keep that size when the on-screen keyboard opens, so the checkout
 * does not shrink. The offset follows a pan of the visible area, but stays
 * inside the layout viewport. On a page that fits the screen, the box is the
 * layout viewport, as before, also when the browser pans the visible area to
 * show a focused checkout field above the keyboard.
 */
const screenBoxInsets = (screenHeight: string) => `
          top: max(0px, min(${VISIBLE_TOP}, calc(100% - ${screenHeight})));
          right: max(0px, calc(100% - ${VISIBLE_LEFT} - 100vw));
          bottom: max(0px, calc(100% - ${VISIBLE_TOP} - ${screenHeight}));
          left: max(0px, min(${VISIBLE_LEFT}, calc(100% - 100vw)));`;

export default function BookingkitCheckoutModal({
  url,
  onClose,
  language,
  returnFocusTo,
  scaledPage = null,
}: BookingkitCheckoutModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const externalLinkRef = useRef<HTMLAnchorElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /*
   * Place the dialog on the visible part of the page. On a phone, a host page
   * wider than the screen makes the layout viewport larger than the screen,
   * and the dialog was cut off at the right and the bottom (#77).
   */
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!url || !dialog) return;
    return trackVisualViewport(dialog);
  }, [url]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const closeButton = closeButtonRef.current;
    const externalLink = externalLinkRef.current;
    if (!url || !dialog || !closeButton || !externalLink) return;

    const root = dialog.getRootNode();
    // Pointer activation can clear focus before the modal mounts, especially in Safari.
    const previousFocus = returnFocusTo ?? (root instanceof ShadowRoot
      ? root.activeElement
      : dialog.ownerDocument.activeElement);
    let closeRequested = false;

    const requestClose = () => {
      if (closeRequested) return;
      closeRequested = true;
      onCloseRef.current();
    };
    const handleCancel = (event: Event) => {
      event.preventDefault();
      requestClose();
    };
    const handleExternalLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      // Run inside the trusted click. Host scripts can cancel default navigation.
      window.open(url, "_blank", "noopener,noreferrer");
    };
    const handleMessage = (event: MessageEvent<unknown>) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.origin !== CHECKOUT_ORIGIN || event.source !== frameWindow) return;
      if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) return;
      if ((event.data as { action?: unknown }).action === "closeLightbox") requestClose();
    };

    // NitroPack can replace element listener methods and React delegation.
    EventTarget.prototype.addEventListener.call(closeButton, "click", requestClose);
    EventTarget.prototype.addEventListener.call(externalLink, "click", handleExternalLink as EventListener);
    EventTarget.prototype.addEventListener.call(dialog, "cancel", handleCancel);
    EventTarget.prototype.addEventListener.call(dialog, "close", requestClose);
    window.addEventListener("message", handleMessage);

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    // preventScroll: a plain focus() can pan the host page on phones (#69).
    closeButton.focus({ preventScroll: true });

    return () => {
      EventTarget.prototype.removeEventListener.call(closeButton, "click", requestClose);
      EventTarget.prototype.removeEventListener.call(externalLink, "click", handleExternalLink as EventListener);
      EventTarget.prototype.removeEventListener.call(dialog, "cancel", handleCancel);
      EventTarget.prototype.removeEventListener.call(dialog, "close", requestClose);
      window.removeEventListener("message", handleMessage);
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      // The opener can leave the page while the checkout is open: when the
      // answer completes, its link button becomes a checkout card. Focus then
      // goes to the newest link with the same checkout URL, outside a dialog.
      const opener = previousFocus instanceof HTMLElement && previousFocus.isConnected
        ? previousFocus
        : previousFocus instanceof HTMLAnchorElement && (root instanceof ShadowRoot || root instanceof Document)
          ? Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))
            .filter((anchor) => anchor.getAttribute("href") === url && !anchor.closest("dialog"))
            .pop()
          : undefined;
      if (opener) {
        // preventScroll keeps the host page still (#69). The message list can
        // move while the modal is open, so scroll only the list to the opener.
        opener.focus({ preventScroll: true });
        revealInScrollContainer(opener);
      }
    };
  }, [url, returnFocusTo]);

  if (!url) return null;

  /*
   * On a scaled page, undo the page scale as the widget root does, so the
   * checkout lays out at the screen size. The modal dialog is in the top
   * layer, outside the root frame, so it covers the layout viewport itself.
   * It keeps that size when the on-screen keyboard opens, as on other pages.
   * Without showModal(), the dialog stays in the frame, which undoes the
   * scale already.
   */
  const inTopLayer = typeof HTMLDialogElement !== "undefined" &&
    typeof HTMLDialogElement.prototype.showModal === "function";
  const scaledStyle: React.CSSProperties | undefined = scaledPage && inTopLayer
    ? {
        top: 0,
        left: 0,
        right: "auto",
        bottom: "auto",
        margin: 0,
        width: `${scaledPage.width}px`,
        height: `${scaledPage.height}px`,
        borderRadius: 0,
        transform: `scale(${1 / scaledPage.scale})`,
        transformOrigin: "0 0",
      }
    : undefined;

  const t = translations[language] || translations.en;
  const title = t.checkoutTitle;
  const closeLabel = t.closeCheckout;
  const externalLabel = t.openInNewTab;

  return (
    <dialog
      ref={dialogRef}
      className="cl-bk-checkout-dialog"
      style={scaledStyle}
      aria-label={title}
      aria-modal="true"
    >
      <header className="cl-bk-checkout-header">
        <h2>{title}</h2>
        <a ref={externalLinkRef} href={url} target="_blank" rel="noopener noreferrer">
          {externalLabel}
        </a>
        <button ref={closeButtonRef} type="button" aria-label={closeLabel} title={closeLabel}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <iframe
        ref={iframeRef}
        src={url}
        title={title}
        allow="payment"
        className="cl-bk-checkout-frame"
      />
      <style>{`
        .cl-bk-checkout-dialog {
          position: fixed;
          /* margin: auto centers the dialog in the screen box. */${screenBoxInsets("100vh")}
          margin: auto;
          padding: 0;
          border: 0;
          border-radius: 12px;
          width: min(810px, calc(100vw - 32px));
          max-width: none;
          height: min(860px, calc(100vh - 40px));
          height: min(860px, calc(100dvh - 40px));
          max-height: none;
          overflow: hidden;
          background: #ffffff;
          color: #1f2937;
          font: 16px/1.5 system-ui, sans-serif;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
          /* The scaled page frame (scaledPage.ts) sets none on the widget root. */
          pointer-events: auto;
        }
        /* A declaration with var() never falls back to an earlier one, so test dvh here. */
        @supports (height: 100dvh) {
          .cl-bk-checkout-dialog {${screenBoxInsets("100dvh")}
          }
        }
        .cl-bk-checkout-dialog[open] {
          display: flex;
          flex-direction: column;
        }
        .cl-bk-checkout-dialog::backdrop { background: rgba(0, 0, 0, 0.6); }
        .cl-bk-checkout-header {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
        }
        .cl-bk-checkout-header h2 {
          flex: 1;
          margin: 0;
          font: inherit;
          font-weight: 600;
        }
        .cl-bk-checkout-header a {
          color: #1d4ed8;
          font-size: 14px;
          text-decoration: underline;
        }
        .cl-bk-checkout-header button {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          padding: 0;
          border: 0;
          border-radius: 6px;
          background: #f3f4f6;
          color: inherit;
          cursor: pointer;
        }
        .cl-bk-checkout-header button:focus-visible,
        .cl-bk-checkout-header a:focus-visible {
          outline: 2px solid #1d4ed8;
          outline-offset: 2px;
        }
        .cl-bk-checkout-frame {
          display: block;
          flex: 1;
          width: 100%;
          min-height: 0;
          border: 0;
          background: #ffffff;
        }
        @media (max-width: 767px) {
          .cl-bk-checkout-dialog {
            width: 100vw;
            height: 100vh;
            height: 100dvh;
            border-radius: 0;
          }
        }
      `}</style>
    </dialog>
  );
}
