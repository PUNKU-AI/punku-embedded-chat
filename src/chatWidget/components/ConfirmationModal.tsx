import React, { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { revealInScrollContainer } from '../utils';
import { containScrollEvents } from '../scrollContainment';

interface ConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** The name of the close button (X) for screen readers, in the chat language. */
  closeLabel?: string;
  buttonColor?: string;
  buttonTextColor?: string;
}

export default function ConfirmationModal({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = "Yes",
  cancelText = "Cancel",
  closeLabel = "Close",
  buttonColor,
  buttonTextColor
}: ConfirmationModalProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  /*
   * The dialog asks before it deletes the conversation: the focus goes to
   * Cancel, the safe answer. A layout effect, so the focus is in the dialog
   * before the browser moves it off the now inert window (ChatWindow).
   * preventScroll: a plain focus() can pan the host page on phones (#69).
   * In a short window only the dialog scrolls to show the button.
   */
  useLayoutEffect(() => {
    const cancelButton = cancelButtonRef.current;
    if (!isOpen || !cancelButton) return;
    cancelButton.focus({ preventScroll: true });
    revealInScrollContainer(cancelButton);
  }, [isOpen]);

  // A dialog that scrolls keeps the wheel from host smooth-scroll libraries,
  // as the message list does (scrollContainment.ts).
  useEffect(() => (isOpen ? containScrollEvents(dialogRef.current) : undefined), [isOpen]);

  if (!isOpen) return null;

  /*
   * aria-modal: Tab and Shift+Tab go round the dialog's buttons and never
   * leave it. The dialog moves the focus itself: Safari's Tab skips buttons
   * unless the visitor turned that on, and would leave the dialog.
   */
  const keepFocusInside = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (buttons.length === 0) return;
    const focused = (event.currentTarget.getRootNode() as Document | ShadowRoot).activeElement;
    const index = buttons.indexOf(focused as HTMLButtonElement);
    const next = event.shiftKey
      ? (index <= 0 ? buttons.length - 1 : index - 1)
      : (index + 1) % buttons.length;
    event.preventDefault();
    buttons[next].focus({ preventScroll: true });
    // preventScroll also stops the dialog's own scroll in a short window.
    revealInScrollContainer(buttons[next]);
  };

  return (
    // A press on the dimmed backdrop keeps the focus in the dialog.
    <div
      className="cl-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div
        ref={dialogRef}
        className="cl-modal"
        role="alertdialog"
        aria-modal="true"
        // A press on the dialog's text focuses the dialog, so Tab stays inside.
        tabIndex={-1}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        onKeyDown={keepFocusInside}
      >
        <div className="cl-modal-header">
          <div className="cl-modal-title">
            <AlertCircle size={20} color="#f59e0b" aria-hidden="true" />
            <span id={`${id}-title`}>{title}</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="cl-modal-close"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="cl-modal-body">
          <p id={`${id}-message`}>{message}</p>
        </div>

        <div className="cl-modal-footer">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="cl-modal-btn cl-modal-btn-cancel"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="cl-modal-btn cl-modal-btn-confirm"
            style={{
              ...(buttonColor ? { backgroundColor: buttonColor } : {}),
              color: buttonTextColor || 'white'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>

      <style>{`
        .cl-modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10001;
          border-radius: 12px;
          /* Ensure it covers the entire widget container */
          width: 100%;
          height: 100%;
        }

        /* In a short window (a zoomed page, a small screen), the dialog
           scrolls: the buttons stay reachable and the focus stays visible. */
        .cl-modal {
          background: white;
          border-radius: 8px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          max-width: 400px;
          width: 90%;
          max-height: 90%;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
        }

        /* Only a press focuses the dialog itself; Tab never stops on it. */
        .cl-modal:focus {
          outline: none;
        }

        .cl-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
          background-color: #f9fafb;
        }

        .cl-modal-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 16px;
          color: #374151;
        }

        .cl-modal-close {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          color: #6b7280;
          transition: background-color 0.2s, color 0.2s;
        }

        .cl-modal-close:hover {
          background-color: #e5e7eb;
          color: #374151;
        }

        .cl-modal-body {
          padding: 20px;
          color: #374151;
          line-height: 1.6;
        }

        .cl-modal-body p {
          margin: 0;
          font-size: 14px;
        }

        .cl-modal-footer {
          display: flex;
          gap: 12px;
          padding: 16px 20px;
          background-color: #f9fafb;
          border-top: 1px solid #e5e7eb;
          justify-content: flex-end;
        }

        .cl-modal-btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          min-width: 80px;
        }

        .cl-modal-btn-cancel {
          background-color: white;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .cl-modal-btn-cancel:hover {
          background-color: #f3f4f6;
          border-color: #9ca3af;
        }

        /* White text reads at 4.8:1 on #dc2626 (WCAG 1.4.3). */
        .cl-modal-btn-confirm {
          background-color: #dc2626;
          color: white;
        }

        .cl-modal-btn-confirm:hover {
          background-color: #b91c1c;
        }
      `}</style>
    </div>
  );
}
