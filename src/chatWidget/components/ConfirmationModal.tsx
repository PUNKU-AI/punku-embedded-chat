import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
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
  buttonColor,
  buttonTextColor
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="cl-modal-overlay">
      <div className="cl-modal">
        <div className="cl-modal-header">
          <div className="cl-modal-title">
            <AlertCircle size={20} color="#f59e0b" />
            <span>{title}</span>
          </div>
          <button onClick={onCancel} className="cl-modal-close">
            <X size={18} />
          </button>
        </div>

        <div className="cl-modal-body">
          <p>{message}</p>
        </div>

        <div className="cl-modal-footer">
          <button
            onClick={onCancel}
            className="cl-modal-btn cl-modal-btn-cancel"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="cl-modal-btn cl-modal-btn-confirm"
            style={{
              backgroundColor: buttonColor || '#ef4444',
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

        .cl-modal {
          background: white;
          border-radius: 8px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          max-width: 400px;
          width: 90%;
          max-height: 90%;
          overflow: hidden;
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

        .cl-modal-btn-confirm {
          background-color: #ef4444;
          color: white;
        }

        .cl-modal-btn-confirm:hover {
          background-color: #dc2626;
        }
      `}</style>
    </div>
  );
}