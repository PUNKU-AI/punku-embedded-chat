import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmationModal from './ConfirmationModal';
import * as utils from '../utils';
import * as scrollContainment from '../scrollContainment';

describe('ConfirmationModal', () => {
  const defaultProps = {
    isOpen: true,
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    title: 'Test Title',
    message: 'Test message content'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Visibility', () => {
    it('should render when isOpen is true', () => {
      render(<ConfirmationModal {...defaultProps} />);

      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test message content')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(<ConfirmationModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Test Title')).not.toBeInTheDocument();
      expect(screen.queryByText('Test message content')).not.toBeInTheDocument();
    });
  });

  describe('Content', () => {
    it('should display the title', () => {
      render(<ConfirmationModal {...defaultProps} title="Custom Title" />);

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('should display the message', () => {
      render(<ConfirmationModal {...defaultProps} message="Custom message" />);

      expect(screen.getByText('Custom message')).toBeInTheDocument();
    });

    it('should display default button text', () => {
      render(<ConfirmationModal {...defaultProps} />);

      expect(screen.getByText('Yes')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should display custom confirm button text', () => {
      render(<ConfirmationModal {...defaultProps} confirmText="Confirm Action" />);

      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    });

    it('should display custom cancel button text', () => {
      render(<ConfirmationModal {...defaultProps} cancelText="Go Back" />);

      expect(screen.getByText('Go Back')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should call onConfirm when confirm button is clicked', () => {
      const onConfirm = jest.fn();
      render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} />);

      const confirmButton = screen.getByText('Yes');
      fireEvent.click(confirmButton);

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when cancel button is clicked', () => {
      const onCancel = jest.fn();
      render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when close button is clicked', () => {
      const onCancel = jest.fn();
      render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);

      const closeButton = document.querySelector('.cl-modal-close');
      expect(closeButton).toBeInTheDocument();

      fireEvent.click(closeButton!);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Styling', () => {
    it('should apply custom button color', () => {
      render(<ConfirmationModal {...defaultProps} buttonColor="#00ff00" />);

      const confirmButton = document.querySelector('.cl-modal-btn-confirm');
      expect(confirmButton).toHaveStyle({ backgroundColor: '#00ff00' });
    });

    it('should apply custom button text color', () => {
      render(<ConfirmationModal {...defaultProps} buttonTextColor="#000000" />);

      const confirmButton = document.querySelector('.cl-modal-btn-confirm');
      expect(confirmButton).toHaveStyle({ color: '#000000' });
    });

    it('should use a default red that white text reads on when not provided', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const confirmButton = document.querySelector('.cl-modal-btn-confirm');
      // The stylesheet colours it: #dc2626, 4.8:1 with white text.
      expect(confirmButton).not.toHaveAttribute('style', expect.stringContaining('background'));
      expect(confirmButton).toHaveStyle({ backgroundColor: '#dc2626' });
    });

    it('should use default button text color when not provided', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const confirmButton = document.querySelector('.cl-modal-btn-confirm');
      expect(confirmButton).toHaveStyle({ color: 'rgb(255, 255, 255)' });
    });
  });

  describe('CSS Classes', () => {
    it('should have modal overlay class', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const overlay = document.querySelector('.cl-modal-overlay');
      expect(overlay).toBeInTheDocument();
    });

    it('should have modal class', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const modal = document.querySelector('.cl-modal');
      expect(modal).toBeInTheDocument();
    });

    it('should have modal header class', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const header = document.querySelector('.cl-modal-header');
      expect(header).toBeInTheDocument();
    });

    it('should have modal body class', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const body = document.querySelector('.cl-modal-body');
      expect(body).toBeInTheDocument();
    });

    it('should have modal footer class', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const footer = document.querySelector('.cl-modal-footer');
      expect(footer).toBeInTheDocument();
    });

    it('should have modal title class', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const title = document.querySelector('.cl-modal-title');
      expect(title).toBeInTheDocument();
    });

    it('should have modal close button class', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const closeButton = document.querySelector('.cl-modal-close');
      expect(closeButton).toBeInTheDocument();
    });

    it('should have modal button classes', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const cancelBtn = document.querySelector('.cl-modal-btn-cancel');
      const confirmBtn = document.querySelector('.cl-modal-btn-confirm');

      expect(cancelBtn).toBeInTheDocument();
      expect(confirmBtn).toBeInTheDocument();
    });
  });

  describe('Icon', () => {
    it('should render alert icon', () => {
      render(<ConfirmationModal {...defaultProps} />);

      // The AlertCircle icon from lucide-react should be present
      const titleElement = document.querySelector('.cl-modal-title');
      expect(titleElement).toBeInTheDocument();

      // Should contain an SVG (the AlertCircle icon)
      const svg = titleElement?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render close icon in close button', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const closeButton = document.querySelector('.cl-modal-close');
      const svg = closeButton?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have buttons with correct roles', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(3); // Close button, Cancel button, Confirm button
    });

    it('should be a modal alert dialog named by its title and described by its message', () => {
      render(<ConfirmationModal {...defaultProps} />);

      const dialog = screen.getByRole('alertdialog', { name: 'Test Title', description: 'Test message content' });
      expect(dialog).toHaveClass('cl-modal');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('should name the close button (WCAG 4.1.2), also in the chat language', () => {
      const { rerender } = render(<ConfirmationModal {...defaultProps} />);

      const closeButton = screen.getByRole('button', { name: 'Close' });
      expect(closeButton).toHaveClass('cl-modal-close');
      expect(closeButton).toHaveAttribute('title', 'Close');
      expect(closeButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

      rerender(<ConfirmationModal {...defaultProps} closeLabel="Schließen" />);
      expect(screen.getByRole('button', { name: 'Schließen' })).toHaveClass('cl-modal-close');
    });

    it('should move the focus to Cancel, the safe answer, when it opens', () => {
      const { rerender } = render(<ConfirmationModal {...defaultProps} isOpen={false} />);

      rerender(<ConfirmationModal {...defaultProps} isOpen={true} />);

      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });

    it('should keep Tab and Shift+Tab inside the dialog', () => {
      render(<ConfirmationModal {...defaultProps} />);
      const close = screen.getByRole('button', { name: 'Close' });
      const confirm = screen.getByRole('button', { name: 'Yes' });

      confirm.focus();
      fireEvent.keyDown(confirm, { key: 'Tab' });
      expect(close).toHaveFocus();

      fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
      expect(confirm).toHaveFocus();
    });

    it('should move Tab between all its buttons itself, as Safari skips buttons', () => {
      render(<ConfirmationModal {...defaultProps} />);
      const cancel = screen.getByRole('button', { name: 'Cancel' });
      expect(cancel).toHaveFocus();

      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      cancel.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(screen.getByRole('button', { name: 'Yes' })).toHaveFocus();
    });

    it('should show the button that Tab moves to, also in a dialog that scrolls', () => {
      const reveal = jest.spyOn(utils, 'revealInScrollContainer');
      try {
        render(<ConfirmationModal {...defaultProps} />);
        const cancel = screen.getByRole('button', { name: 'Cancel' });
        reveal.mockClear();

        fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });

        const close = screen.getByRole('button', { name: 'Close' });
        expect(close).toHaveFocus();
        expect(reveal).toHaveBeenCalledWith(close);
      } finally {
        reveal.mockRestore();
      }
    });

    it('should keep the wheel inside the dialog while it is open', () => {
      const release = jest.fn();
      const contain = jest.spyOn(scrollContainment, 'containScrollEvents').mockReturnValue(release);
      try {
        const { rerender } = render(<ConfirmationModal {...defaultProps} />);
        expect(contain).toHaveBeenCalledWith(screen.getByRole('alertdialog'));

        rerender(<ConfirmationModal {...defaultProps} isOpen={false} />);
        expect(release).toHaveBeenCalledTimes(1);
      } finally {
        contain.mockRestore();
      }
    });

    it('should take the focus itself on a press on its text, so Tab stays inside', () => {
      render(<ConfirmationModal {...defaultProps} />);
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveAttribute('tabindex', '-1');

      dialog.focus();
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

      dialog.focus();
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(screen.getByRole('button', { name: 'Yes' })).toHaveFocus();
    });

    it('should keep the focus in the dialog when the visitor presses the dimmed backdrop', () => {
      render(<ConfirmationModal {...defaultProps} />);
      const overlay = document.querySelector('.cl-modal-overlay') as HTMLElement;

      // fireEvent returns false when the press has its default prevented.
      expect(fireEvent.mouseDown(overlay)).toBe(false);
      expect(fireEvent.mouseDown(screen.getByRole('alertdialog'))).toBe(true);
    });

    it('should leave other keys to the browser', () => {
      render(<ConfirmationModal {...defaultProps} />);
      const cancel = screen.getByRole('button', { name: 'Cancel' });

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      cancel.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(cancel).toHaveFocus();
    });
  });
});
