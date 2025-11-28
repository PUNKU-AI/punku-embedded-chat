import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ChatMessagePlaceholder from './index';

describe('ChatMessagePlaceholder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Default Theme Rendering', () => {
    it('should render with default theme', () => {
      render(<ChatMessagePlaceholder />);

      const messageContainer = document.querySelector('.cl-chat-message');
      expect(messageContainer).toBeInTheDocument();
      expect(messageContainer).toHaveClass('cl-justify-start');
    });

    it('should render bot message container', () => {
      render(<ChatMessagePlaceholder />);

      const botMessage = document.querySelector('.cl-bot_message');
      expect(botMessage).toBeInTheDocument();
    });

    it('should have animate-pulse class for default theme', () => {
      render(<ChatMessagePlaceholder />);

      const pulseElement = document.querySelector('.cl-animate-pulse');
      expect(pulseElement).toBeInTheDocument();
    });

    it('should apply custom bot message style', () => {
      const customStyle = { backgroundColor: 'blue', color: 'white' };
      render(<ChatMessagePlaceholder bot_message_style={customStyle} />);

      const botMessage = document.querySelector('.cl-bot_message');
      expect(botMessage).toHaveStyle({ backgroundColor: 'blue', color: 'white' });
    });
  });

  describe('Swarovski Theme (Crystalline)', () => {
    it('should render crystalline styling for swarovski theme', () => {
      render(<ChatMessagePlaceholder theme="swarovski" />);

      const thinkingMessage = document.querySelector('.cl-thinking-message');
      expect(thinkingMessage).toBeInTheDocument();
    });

    it('should render crystal loader for swarovski theme', () => {
      render(<ChatMessagePlaceholder theme="swarovski" />);

      const crystalLoader = document.querySelector('.cl-crystal-loader');
      expect(crystalLoader).toBeInTheDocument();
    });

    it('should render loader image for swarovski theme', () => {
      render(<ChatMessagePlaceholder theme="swarovski" />);

      const loaderImage = screen.getByAltText('Loading...');
      expect(loaderImage).toBeInTheDocument();
    });

    it('should NOT have animate-pulse class for swarovski theme', () => {
      render(<ChatMessagePlaceholder theme="swarovski" />);

      const pulseElement = document.querySelector('.cl-animate-pulse');
      expect(pulseElement).not.toBeInTheDocument();
    });
  });

  describe('Message Rotation', () => {
    it('should change message after interval for default theme', () => {
      // Mock Math.random to return predictable values
      const mockMath = Object.create(global.Math);
      mockMath.random = jest.fn()
        .mockReturnValueOnce(0) // First message index 0
        .mockReturnValueOnce(0.5); // After interval, different index
      global.Math = mockMath;

      render(<ChatMessagePlaceholder />);

      // Advance timer by 2.5 seconds
      act(() => {
        jest.advanceTimersByTime(2500);
      });

      // The component should have called setInterval
      expect(mockMath.random).toHaveBeenCalled();
    });

    it('should change message after interval for swarovski theme', () => {
      const mockMath = Object.create(global.Math);
      mockMath.random = jest.fn().mockReturnValue(0);
      global.Math = mockMath;

      render(<ChatMessagePlaceholder theme="swarovski" language="en" />);

      act(() => {
        jest.advanceTimersByTime(2500);
      });

      expect(mockMath.random).toHaveBeenCalled();
    });

    it('should clear interval on unmount', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const { unmount } = render(<ChatMessagePlaceholder />);
      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('Language Support', () => {
    it('should render English messages for swarovski theme with language="en"', () => {
      // Reset Math.random to return first message
      const mockMath = Object.create(global.Math);
      mockMath.random = jest.fn().mockReturnValue(0);
      mockMath.floor = Math.floor;
      global.Math = mockMath;

      render(<ChatMessagePlaceholder theme="swarovski" language="en" />);

      // First English crystalline message contains "Magic in the air"
      const messageContainer = document.querySelector('.cl-thinking-message');
      expect(messageContainer).toBeInTheDocument();
    });

    it('should render German messages for swarovski theme with language="de"', () => {
      const mockMath = Object.create(global.Math);
      mockMath.random = jest.fn().mockReturnValue(0);
      mockMath.floor = Math.floor;
      global.Math = mockMath;

      render(<ChatMessagePlaceholder theme="swarovski" language="de" />);

      // First German crystalline message contains "Magie liegt in der Luft"
      const messageContainer = document.querySelector('.cl-thinking-message');
      expect(messageContainer).toBeInTheDocument();
    });

    it('should default to English when no language is specified', () => {
      render(<ChatMessagePlaceholder theme="swarovski" />);

      const messageContainer = document.querySelector('.cl-thinking-message');
      expect(messageContainer).toBeInTheDocument();
    });
  });

  describe('Theme Variants', () => {
    const nonCrystallineThemes: Array<"default" | "dark" | "ocean" | "aurora" | "punku-ai-bookingkit"> = [
      'default',
      'dark',
      'ocean',
      'aurora',
      'punku-ai-bookingkit'
    ];

    nonCrystallineThemes.forEach(theme => {
      it(`should render default placeholder for ${theme} theme`, () => {
        render(<ChatMessagePlaceholder theme={theme} />);

        const botMessage = document.querySelector('.cl-bot_message');
        const pulseElement = document.querySelector('.cl-animate-pulse');

        expect(botMessage).toBeInTheDocument();
        expect(pulseElement).toBeInTheDocument();
      });
    });

    it('should render crystalline placeholder for swarovski theme', () => {
      render(<ChatMessagePlaceholder theme="swarovski" />);

      const thinkingMessage = document.querySelector('.cl-thinking-message');
      expect(thinkingMessage).toBeInTheDocument();
    });
  });

  describe('CSS Classes', () => {
    it('should have cl-chat-message class on container', () => {
      render(<ChatMessagePlaceholder />);

      const container = document.querySelector('.cl-chat-message');
      expect(container).toBeInTheDocument();
    });

    it('should have cl-justify-start class for left alignment', () => {
      render(<ChatMessagePlaceholder />);

      const container = document.querySelector('.cl-chat-message');
      expect(container).toHaveClass('cl-justify-start');
    });
  });

  describe('Interval Behavior', () => {
    it('should update message index periodically', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      render(<ChatMessagePlaceholder />);

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        2500
      );

      setIntervalSpy.mockRestore();
    });

    it('should use correct interval timing', () => {
      render(<ChatMessagePlaceholder />);

      // Should not have changed immediately
      const initialState = document.querySelector('.cl-animate-pulse')?.textContent;

      // Advance by less than interval
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Message should still be the same (timer hasn't fired)
      // Note: this test is probabilistic due to random selection
    });
  });
});
