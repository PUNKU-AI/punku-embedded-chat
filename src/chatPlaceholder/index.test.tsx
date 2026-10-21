import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ChatMessagePlaceholder from './index';
import { thinkingMessages } from '../translations';

// Some tests below replace global.Math; give every test the real one back.
const realMath = global.Math;

describe('ChatMessagePlaceholder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.Math = realMath;
  });

  const phrase = () => document.querySelector('.cl-typing-text')?.textContent;

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

    it('should show three typing dots and a thinking phrase for the default theme', () => {
      render(<ChatMessagePlaceholder />);

      const typing = document.querySelector('.cl-bot_message.cl-typing');
      expect(typing).toBeInTheDocument();
      expect(typing?.querySelectorAll('.cl-typing-dots span')).toHaveLength(3);
      expect(phrase()).toBeTruthy();
    });

    it('should hide the decorative dots from screen readers', () => {
      render(<ChatMessagePlaceholder />);

      expect(document.querySelector('.cl-typing-dots')).toHaveAttribute('aria-hidden', 'true');
    });

    it('should apply custom bot message style', () => {
      const customStyle = { backgroundColor: 'blue', color: 'white' };
      render(<ChatMessagePlaceholder bot_message_style={customStyle} />);

      const botMessage = document.querySelector('.cl-bot_message');
      expect(botMessage).toHaveStyle({ backgroundColor: 'rgb(0, 0, 255)', color: 'rgb(255, 255, 255)' });
    });

    it('should render custom loading messages when provided', () => {
      render(<ChatMessagePlaceholder loading_messages={['Custom loading 1', 'Custom loading 2']} />);
      expect(screen.getByText('Custom loading 1')).toBeInTheDocument();
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

    it('should NOT show typing dots for swarovski theme', () => {
      render(<ChatMessagePlaceholder theme="swarovski" />);

      expect(document.querySelector('.cl-typing-dots')).not.toBeInTheDocument();
    });

    it('should show the site sending text with the crystal loader', () => {
      render(<ChatMessagePlaceholder theme="swarovski" sending_text="Einen Moment…" />);

      expect(screen.getByText('Einen Moment…')).toBeInTheDocument();
      expect(document.querySelector('.cl-crystal-loader')).toBeInTheDocument();
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

    it('should show an English thinking phrase by default', () => {
      render(<ChatMessagePlaceholder />);

      expect(thinkingMessages.en).toContain(phrase());
    });

    it('should show a German thinking phrase for language="de"', () => {
      render(<ChatMessagePlaceholder language="de" />);

      expect(thinkingMessages.de).toContain(phrase());
    });

    it('should keep every phrase in the chat language as the phrase rotates', () => {
      render(<ChatMessagePlaceholder language="en" />);

      for (let step = 0; step < 10; step += 1) {
        act(() => {
          jest.advanceTimersByTime(2500);
        });
        expect(thinkingMessages.en).toContain(phrase());
      }
    });

    it('should have one English phrase for each German phrase', () => {
      expect(thinkingMessages.de).toHaveLength(30);
      expect(thinkingMessages.en).toHaveLength(thinkingMessages.de.length);
      expect(new Set(thinkingMessages.en).size).toBe(thinkingMessages.en.length);
    });
  });

  describe('Phrase Sources', () => {
    it('should show the site sending text when loading_messages is empty', () => {
      render(<ChatMessagePlaceholder sending_text="  Please wait…  " loading_messages={[]} />);

      expect(phrase()).toBe('Please wait…');
    });

    it('should prefer loading_messages over the sending text', () => {
      render(<ChatMessagePlaceholder sending_text="Please wait…" loading_messages={['Checking the timetable…']} />);

      expect(phrase()).toBe('Checking the timetable…');
    });

    it('should use the built-in phrases when the sending text is blank', () => {
      render(<ChatMessagePlaceholder sending_text="   " language="de" />);

      expect(thinkingMessages.de).toContain(phrase());
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

        expect(botMessage).toHaveClass('cl-typing');
        expect(botMessage?.querySelectorAll('.cl-typing-dots span')).toHaveLength(3);
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

      const initialState = phrase();

      // Advance by less than interval
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Message should still be the same (timer hasn't fired)
      expect(phrase()).toBe(initialState);
    });
  });
});
