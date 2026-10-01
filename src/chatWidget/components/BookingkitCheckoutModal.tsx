import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface BookingkitCheckoutModalProps {
  url: string | null;
  onClose: () => void;
  language: "en" | "de";
  returnFocusTo?: HTMLElement;
}

const CHECKOUT_ORIGIN = "https://eu5.bookingkit.de";

export default function BookingkitCheckoutModal({
  url,
  onClose,
  language,
  returnFocusTo,
}: BookingkitCheckoutModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const externalLinkRef = useRef<HTMLAnchorElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
    closeButton.focus();

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
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [url, returnFocusTo]);

  if (!url) return null;

  const title = language === "de" ? "Buchung" : "Checkout";
  const closeLabel = language === "de" ? "Buchung schließen" : "Close checkout";
  const externalLabel = language === "de" ? "In neuem Tab öffnen" : "Open in new tab";

  return (
    <dialog
      ref={dialogRef}
      className="cl-bk-checkout-dialog"
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
          inset: 0;
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
