import React from 'react';
import { render, act } from '@testing-library/react';
import ChatMessagePlaceholder, { PHRASE_INTERVAL_MS } from './index';
import { splitThinkingText } from './phrases';
import { crystallineThinkingMessages, Language, thinkingMessages } from '../translations';

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
  // The built-in phrases as the bubble shows them: without their own "…".
  const shownPhrases = (language: Language) => thinkingMessages[language].map((text) => splitThinkingText(text)[0]);
  const bubbleText = () => document.querySelector('.cl-typing')?.textContent;

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

    it('should show a thinking phrase and three dots after it for the default theme', () => {
      render(<ChatMessagePlaceholder />);

      const typing = document.querySelector('.cl-bot_message.cl-typing');
      expect(typing).toBeInTheDocument();
      expect(Array.from(typing!.children).map((child) => child.className)).toEqual(['cl-typing-text', 'cl-typing-dots']);
      expect(Array.from(typing!.querySelectorAll('.cl-typing-dots span')).map((dot) => dot.textContent)).toEqual(['.', '.', '.']);
      expect(phrase()).toBeTruthy();
    });

    it.each([
      ['…', 'Checking prices…', 'Checking prices'],
      ['...', 'Sta digitando...', 'Sta digitando'],
      [' ...', 'Agent antwortet ...', 'Agent antwortet'],
      ['..', 'Tankstelle wird angesteuert..', 'Tankstelle wird angesteuert'],
      ['.', 'Einen Moment – ich schaue nach.', 'Einen Moment – ich schaue nach'],
      ['no dots', 'Lass mich mal schauen', 'Lass mich mal schauen'],
    ])('should replace a trailing %j with the three dots', (_ending, text, shown) => {
      render(<ChatMessagePlaceholder language="de" loading_messages={[text]} />);

      expect(phrase()).toBe(shown);
      expect(bubbleText()).toBe(`${shown}...`);
    });

    it('should put the dots before a trailing emoji', () => {
      render(<ChatMessagePlaceholder language="de" loading_messages={['Die Karten werden sortiert… 🛶']} />);

      const typing = document.querySelector('.cl-typing')!;
      expect(Array.from(typing.children).map((child) => child.className)).toEqual(['cl-typing-text', 'cl-typing-dots', 'cl-typing-tail']);
      expect(bubbleText()).toBe('Die Karten werden sortiert... 🛶');
    });

    it('should show built-in phrases without their own ellipsis', () => {
      render(<ChatMessagePlaceholder language="de" />);

      expect(shownPhrases('de')).toContain(phrase());
      expect(bubbleText()).not.toContain('…');
      expect(bubbleText()).toMatch(/[^.]\.\.\.$/);
    });

    it('should restart the dots with each new phrase', () => {
      const mockMath = Object.create(global.Math);
      mockMath.random = jest.fn().mockReturnValue(0.5);
      global.Math = mockMath;
      render(<ChatMessagePlaceholder language="en" />);
      const firstDots = document.querySelector('.cl-typing-dots');

      act(() => {
        jest.advanceTimersByTime(PHRASE_INTERVAL_MS);
      });
      const secondDots = document.querySelector('.cl-typing-dots');
      expect(secondDots).not.toBe(firstDots);

      // The same phrase again keeps the running dots.
      act(() => {
        jest.advanceTimersByTime(PHRASE_INTERVAL_MS);
      });
      expect(document.querySelector('.cl-typing-dots')).toBe(secondDots);
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
      expect(phrase()).toBe('Custom loading 1');
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

      const loaderImage = document.querySelector('.cl-crystal-loader img');
      expect(loaderImage).toBeInTheDocument();
      // Decorative: the phrase and the status region say that the assistant writes.
      expect(loaderImage).toHaveAttribute('alt', '');
    });

    it('should NOT show typing dots for swarovski theme', () => {
      render(<ChatMessagePlaceholder theme="swarovski" />);

      expect(document.querySelector('.cl-typing-dots')).not.toBeInTheDocument();
    });

    it('should show a crystal phrase in the chat language with the crystal loader', () => {
      render(<ChatMessagePlaceholder theme="swarovski" language="de" />);

      const shown = document.querySelector('.cl-thinking-message span')?.textContent;
      expect(crystallineThinkingMessages.map((message) => message.de)).toContain(shown);
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

      act(() => {
        jest.advanceTimersByTime(PHRASE_INTERVAL_MS);
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
        jest.advanceTimersByTime(PHRASE_INTERVAL_MS);
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

      expect(shownPhrases('en')).toContain(phrase());
    });

    it('should show a German thinking phrase for language="de"', () => {
      render(<ChatMessagePlaceholder language="de" />);

      expect(shownPhrases('de')).toContain(phrase());
    });

    it('should keep every phrase in the chat language as the phrase rotates', () => {
      render(<ChatMessagePlaceholder language="en" />);

      for (let step = 0; step < 10; step += 1) {
        act(() => {
          jest.advanceTimersByTime(PHRASE_INTERVAL_MS);
        });
        expect(shownPhrases('en')).toContain(phrase());
      }
    });

    it('should have one English phrase for each German phrase', () => {
      expect(thinkingMessages.de).toHaveLength(30);
      expect(thinkingMessages.en).toHaveLength(thinkingMessages.de.length);
      expect(new Set(thinkingMessages.en).size).toBe(thinkingMessages.en.length);
    });
  });

  describe('Phrase Sources', () => {
    it('should prefer loading_messages in the chat language over the built-in phrases', () => {
      render(<ChatMessagePlaceholder language="de" loading_messages={['  Ich prüfe den Fahrplan…  ']} />);

      expect(phrase()).toBe('Ich prüfe den Fahrplan');
    });

    it('should show the built-in phrases when loading_messages are clearly in another language', () => {
      render(<ChatMessagePlaceholder language="it" loading_messages={['Finding the best options…', 'Checking availability and prices…']} />);

      expect(shownPhrases('it')).toContain(phrase());
    });

    it('should keep a short text in an unclear language', () => {
      render(<ChatMessagePlaceholder language="de" loading_messages={['Agent responding ...']} />);

      expect(phrase()).toBe('Agent responding');
    });

    it.each([
      ['it', 'Cerco le migliori opzioni'],
      ['fr', 'Finding the best options'],
    ] as const)('should show the texts per language for a %s chat', (language, shown) => {
      const loadingMessages = { it: ['Cerco le migliori opzioni…'], default: ['Finding the best options…'] };
      render(<ChatMessagePlaceholder language={language} loading_messages={loadingMessages} />);

      expect(phrase()).toBe(shown);
    });

    it('should use the built-in phrases without texts for the chat language or "default"', () => {
      render(<ChatMessagePlaceholder language="pl" loading_messages={{ it: ['Cerco le migliori opzioni…'] }} />);

      expect(shownPhrases('pl')).toContain(phrase());
    });

    it.each([
      ['empty', []],
      ['blank', ['   ', '']],
    ])('should use the built-in phrases when loading_messages is %s', (_case, loadingMessages) => {
      render(<ChatMessagePlaceholder language="de" loading_messages={loadingMessages} />);

      expect(shownPhrases('de')).toContain(phrase());
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
        expect(botMessage?.textContent).toMatch(/[^.]\.\.\.$/);
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

      // Two cycles of the growing dots (3 × 400 ms) per phrase.
      expect(PHRASE_INTERVAL_MS).toBe(2400);
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        PHRASE_INTERVAL_MS
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
