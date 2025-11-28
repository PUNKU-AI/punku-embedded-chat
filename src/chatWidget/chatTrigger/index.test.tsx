import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatTrigger from './index';

describe('ChatTrigger', () => {
  const defaultProps = {
    open: false,
    setOpen: jest.fn(),
    triggerRef: React.createRef<HTMLButtonElement>()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the trigger button', () => {
      render(<ChatTrigger {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should have cl-trigger class', () => {
      render(<ChatTrigger {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('cl-trigger');
    });

    it('should apply theme class', () => {
      render(<ChatTrigger {...defaultProps} theme="dark" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('theme-dark');
    });

    it('should apply default theme class', () => {
      render(<ChatTrigger {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('theme-default');
    });
  });

  describe('Icon Display', () => {
    it('should show MessageSquare icon when closed (non-swarovski theme)', () => {
      render(<ChatTrigger {...defaultProps} open={false} />);

      // The MessageSquare icon should be visible (scale-100)
      const icons = document.querySelectorAll('.cl-trigger-icon');
      expect(icons.length).toBe(2); // X icon and MessageSquare icon
    });

    it('should show X icon when open', () => {
      render(<ChatTrigger {...defaultProps} open={true} />);

      // The X icon should be visible (scale-100) when open
      const icons = document.querySelectorAll('.cl-trigger-icon');
      expect(icons.length).toBe(2);
    });

    it('should show Sparkles icon for swarovski theme when closed', () => {
      render(<ChatTrigger {...defaultProps} theme="swarovski" open={false} />);

      // The Sparkles icon should be used instead of MessageSquare for swarovski
      const icons = document.querySelectorAll('.cl-trigger-icon');
      expect(icons.length).toBe(2); // X icon and Sparkles icon
    });
  });

  describe('Interactions', () => {
    it('should call setOpen with true when clicked while closed', () => {
      const setOpen = jest.fn();
      render(<ChatTrigger {...defaultProps} open={false} setOpen={setOpen} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(setOpen).toHaveBeenCalledWith(true);
    });

    it('should call setOpen with false when clicked while open', () => {
      const setOpen = jest.fn();
      render(<ChatTrigger {...defaultProps} open={true} setOpen={setOpen} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(setOpen).toHaveBeenCalledWith(false);
    });

    it('should prevent default on mousedown', () => {
      render(<ChatTrigger {...defaultProps} />);

      const button = screen.getByRole('button');
      const event = new MouseEvent('mousedown', { bubbles: true });
      const preventDefault = jest.spyOn(event, 'preventDefault');

      button.dispatchEvent(event);

      expect(preventDefault).toHaveBeenCalled();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom button color', () => {
      render(<ChatTrigger {...defaultProps} buttonColor="#ff0000" />);

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ backgroundColor: '#ff0000' });
    });

    it('should apply custom button text color', () => {
      render(<ChatTrigger {...defaultProps} buttonTextColor="#ffffff" />);

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ color: '#ffffff' });
    });

    it('should apply custom style prop', () => {
      const customStyle = { padding: '20px', borderRadius: '50%' };
      render(<ChatTrigger {...defaultProps} style={customStyle} />);

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ padding: '20px', borderRadius: '50%' });
    });

    it('should merge custom style with color overrides', () => {
      const customStyle = { padding: '20px' };
      render(
        <ChatTrigger
          {...defaultProps}
          style={customStyle}
          buttonColor="#ff0000"
          buttonTextColor="#ffffff"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        padding: '20px',
        backgroundColor: '#ff0000',
        color: '#ffffff'
      });
    });
  });

  describe('Ref', () => {
    it('should forward ref to button element', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<ChatTrigger {...defaultProps} triggerRef={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it('should handle null ref gracefully', () => {
      render(<ChatTrigger {...defaultProps} triggerRef={null} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Theme Variants', () => {
    const themes: Array<"default" | "dark" | "ocean" | "aurora" | "punku-ai-bookingkit" | "swarovski"> = [
      'default',
      'dark',
      'ocean',
      'aurora',
      'punku-ai-bookingkit',
      'swarovski'
    ];

    themes.forEach(theme => {
      it(`should render correctly with ${theme} theme`, () => {
        render(<ChatTrigger {...defaultProps} theme={theme} />);

        const button = screen.getByRole('button');
        expect(button).toHaveClass(`theme-${theme}`);
      });
    });
  });

  describe('Icon Animation Classes', () => {
    it('should have cl-scale-100 on X icon when open', () => {
      render(<ChatTrigger {...defaultProps} open={true} />);

      const icons = document.querySelectorAll('.cl-trigger-icon');
      // First icon is X
      expect(icons[0]).toHaveClass('cl-scale-100');
    });

    it('should have cl-scale-0 on X icon when closed', () => {
      render(<ChatTrigger {...defaultProps} open={false} />);

      const icons = document.querySelectorAll('.cl-trigger-icon');
      // First icon is X
      expect(icons[0]).toHaveClass('cl-scale-0');
    });

    it('should have cl-scale-0 on chat icon when open', () => {
      render(<ChatTrigger {...defaultProps} open={true} />);

      const icons = document.querySelectorAll('.cl-trigger-icon');
      // Second icon is chat/sparkles
      expect(icons[1]).toHaveClass('cl-scale-0');
    });

    it('should have cl-scale-100 on chat icon when closed', () => {
      render(<ChatTrigger {...defaultProps} open={false} />);

      const icons = document.querySelectorAll('.cl-trigger-icon');
      // Second icon is chat/sparkles
      expect(icons[1]).toHaveClass('cl-scale-100');
    });
  });
});
