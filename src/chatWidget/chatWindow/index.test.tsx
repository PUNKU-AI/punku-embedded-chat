import React from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ChatWindow from './index';
import { safeAreaGap, visualViewportInset } from '../utils';
import { sendMessage, streamMessage } from '../../controllers';
import type { ChatMessageType } from '../../types/chatWidget';

// jsdom has no scrolling. The widget must not call scrollIntoView (#69).
Element.prototype.scrollIntoView = jest.fn();
Element.prototype.scrollTo = jest.fn();

// Mock the controllers
jest.mock('../../controllers', () => ({
  sendMessage: jest.fn(),
  streamMessage: jest.fn()
}));

// Mock react-markdown
jest.mock('react-markdown', () => {
  return function MockMarkdown({ children }: { children: string }) {
    return <div>{children}</div>;
  };
});

// Mock remark-gfm
jest.mock('remark-gfm', () => () => {});

// Mock the components
jest.mock('./chatMessage', () => {
  return function MockChatMessage({
    message,
    isSend,
    onRetry,
    retryLabel,
    isLatest,
    linkButtons,
    streaming,
    message_id,
  }: {
    message: string;
    message_id?: string;
    isSend: boolean;
    onRetry?: () => void;
    retryLabel?: string;
    isLatest?: boolean;
    linkButtons?: boolean;
    streaming?: boolean;
  }) {
    // The checkout cards, the language and the venue that the answers read.
    const { CardSpeechContext, CheckoutCardsContext } = require('../components/CheckoutCard');
    const checkout = require('react').useContext(CheckoutCardsContext);
    // A complete answer with a checkout link reports a card, as AnswerParagraph does.
    const registry = require('react').useContext(CardSpeechContext);
    require('react').useEffect(() => {
      const start = message.indexOf('**[');
      if (!registry || !message_id || streaming || isSend || !message.includes('bookingkit') || start < 0) return undefined;
      registry.set(message_id, { start, end: message.length, text: 'CARD WORDS' });
      return () => registry.delete(message_id, start);
    });
    return (
      <div
        data-testid={isSend ? 'user-message' : 'bot-message'}
        data-latest={isLatest ? 'true' : undefined}
        data-link-buttons={String(linkButtons)}
        data-streaming={streaming ? 'true' : undefined}
        data-checkout-cards={checkout.cards.map((card: { url: string }) => card.url).join(' ')}
        data-checkout-language={checkout.language}
        data-checkout-venue={checkout.venue}
      >
        {message}
        {onRetry && <button type="button" onClick={onRetry}>{retryLabel}</button>}
      </div>
    );
  };
});

jest.mock('../../chatPlaceholder', () => {
  return function MockChatPlaceholder() {
    return <div data-testid="chat-placeholder">Loading...</div>;
  };
});

jest.mock('../components/ConfirmationModal', () => {
  return function MockConfirmationModal({
    isOpen,
    onConfirm,
    onCancel,
    title,
    buttonColor,
    buttonTextColor
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    buttonColor?: string;
    buttonTextColor?: string;
  }) {
    if (!isOpen) return null;
    return (
      <div data-testid="confirmation-modal" data-button-color={buttonColor ?? ''} data-button-text-color={buttonTextColor ?? ''}>
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  };
});

const mockedSendMessage = sendMessage as jest.MockedFunction<typeof sendMessage>;
const mockedStreamMessage = streamMessage as jest.MockedFunction<typeof streamMessage>;

describe('ChatWindow', () => {
  const mockTriggerRef = {
    current: {
      getBoundingClientRect: () => ({
        top: 100,
        left: 100,
        width: 50,
        height: 50,
        bottom: 150,
        right: 150,
        x: 100,
        y: 100,
        toJSON: () => ({})
      })
    }
  } as React.RefObject<HTMLButtonElement>;

  const mockSessionId = { current: 'test-session-id' };

  const defaultProps = {
    api_key: 'test-api-key',
    flowId: 'test-flow-id',
    hostUrl: 'http://localhost:3000',
    updateLastMessage: jest.fn(),
    messages: [],
    output_type: 'chat',
    input_type: 'chat',
    open: true,
    addMessage: jest.fn(),
    triggerRef: mockTriggerRef,
    sessionId: mockSessionId as React.MutableRefObject<string>
  };

  const successfulNonStreamingResponse = () => ({
    data: {
      outputs: [
        {
          outputs: [
            {
              component_id: 'chat-output',
              outputs: {
                message: { type: 'message', message: { text: 'Assistant reply' } }
              },
              results: { message: { data: { id: 'assistant-message' } } }
            }
          ]
        }
      ],
      session_id: 'new-session'
    },
    status: 200,
    statusText: 'OK',
    headers: new Headers()
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionId.current = 'test-session-id';
  });

  describe('Rendering', () => {
    it('should render when open is true', () => {
      render(<ChatWindow {...defaultProps} />);

      expect(document.querySelector('.cl-chat-window')).toBeInTheDocument();
    });

    it('should have scale-100 class when open', () => {
      render(<ChatWindow {...defaultProps} open={true} />);

      const chatWindow = document.querySelector('.cl-chat-window');
      expect(chatWindow).toHaveClass('cl-scale-100');
    });

    it('should have scale-0 class when closed', () => {
      render(<ChatWindow {...defaultProps} open={false} />);

      const chatWindow = document.querySelector('.cl-chat-window');
      expect(chatWindow).toHaveClass('cl-scale-0');
    });

    it('should anchor to the bottom right by default', () => {
      render(<ChatWindow {...defaultProps} />);

      // From the visible corner, not the layout viewport corner (#77).
      const chatWindow = document.querySelector<HTMLElement>('.cl-chat-window')!;
      expect(chatWindow.style).toMatchObject({
        left: 'auto',
        // The gaps also clear the safe areas, as the trigger does.
        right: visualViewportInset('right', safeAreaGap('right', '20px')),
        bottom: visualViewportInset('bottom', 'var(--cl-window-gap, calc(var(--cl-bottom-offset) + 80px))'),
      });
    });

    it('should keep the 641 px and wider window inside the visible area', () => {
      render(<ChatWindow {...defaultProps} />);

      // jsdom has no layout. The window stylesheet is the result.
      // eslint-disable-next-line testing-library/no-node-access
      const styles = Array.from(document.querySelectorAll('style'), (style) => style.textContent).join('\n');
      expect(styles).toContain('--cl-visible-height: var(--cl-visual-viewport-height, 100vh);');
      expect(styles).toContain('--cl-top-gap: max(8px, var(--cl-safe-area-top, 0px));');
      expect(styles).toContain('--cl-window-gap: min(var(--cl-trigger-gap), calc(var(--cl-visible-height) - var(--cl-top-gap) - var(--cl-window-room)));');
      for (const cap of ['min(75vh, var(--cl-window-room))', 'min(70vh, var(--cl-window-room))']) {
        expect(styles).toContain(`max-height: ${cap} !important;`);
      }
    });

    it('should anchor to the bottom left for bottom-left position', () => {
      render(<ChatWindow {...defaultProps} position="bottom-left" />);

      const chatWindow = document.querySelector<HTMLElement>('.cl-chat-window')!;
      expect(chatWindow.style).toMatchObject({ left: visualViewportInset('left', safeAreaGap('left', '20px')), right: 'auto' });
    });

    it('should apply custom left offset for left-side window placement', () => {
      render(<ChatWindow {...defaultProps} position="bottom-left" left_offset={64} />);

      const chatWindow = document.querySelector<HTMLElement>('.cl-chat-window')!;
      expect(chatWindow.style).toMatchObject({ left: visualViewportInset('left', safeAreaGap('left', '64px')), right: 'auto' });
    });

    it('should apply custom right offset for right-side window placement', () => {
      render(<ChatWindow {...defaultProps} position="bottom-right" right_offset={52} />);

      const chatWindow = document.querySelector<HTMLElement>('.cl-chat-window')!;
      expect(chatWindow.style).toMatchObject({ right: visualViewportInset('right', safeAreaGap('right', '52px')), left: 'auto' });
    });

    it('should use position override style when provided', () => {
      render(
        <ChatWindow
          {...defaultProps}
          positionOverrideStyle={{
            top: '236px',
            left: '24px',
            right: 'auto',
            bottom: 'auto',
            zIndex: 10004,
          }}
        />
      );

      const chatWindow = document.querySelector('.cl-chat-window');
      expect(chatWindow).toHaveStyle({
        top: '236px',
        left: '24px',
        right: 'auto',
        bottom: 'auto',
        zIndex: '10004',
      });
    });

    it('should size an anchored tablet window from its placement', () => {
      render(
        <ChatWindow
          {...defaultProps}
          positionOverrideStyle={{
            top: '70px',
            left: '84px',
            right: '',
            bottom: '',
            '--cl-anchored-window-width': '420px',
            '--cl-anchored-window-height': '256px',
          } as React.CSSProperties}
        />
      );

      const chatWindow = document.querySelector<HTMLElement>('.cl-chat-window')!;
      expect(chatWindow.style.getPropertyValue('--cl-anchored-window-width')).toBe('420px');
      expect(chatWindow.style.getPropertyValue('--cl-anchored-window-height')).toBe('256px');
      const styles = Array.from(document.querySelectorAll('style'))
        .map((style) => style.textContent || '')
        .join('\n');
      // Corner windows keep the CSS size, because they do not set the variables.
      expect(styles).toContain('width: var(--cl-anchored-window-width, min(420px, 85vw)) !important');
      expect(styles).toContain('--cl-window-height: var(--cl-anchored-window-height, min(600px, 75vh));');
      expect(styles).toContain('width: var(--cl-anchored-window-width, min(420px, calc(60vw - 10px))) !important');
      expect(styles).toContain('--cl-window-height: var(--cl-anchored-window-height, min(600px, 70vh));');
      // The room above a corner trigger does not limit an anchored window.
      expect(styles).toContain('max-height: var(--cl-anchored-window-height, min(75vh, var(--cl-window-room))) !important');
      expect(styles).toContain('max-height: var(--cl-anchored-window-height, min(70vh, var(--cl-window-room))) !important');
    });

    it('should not force tablet windows to the right side', () => {
      render(<ChatWindow {...defaultProps} position="bottom-left" left_offset={64} />);

      const styles = Array.from(document.querySelectorAll('style'))
        .map((style) => style.textContent || '')
        .join('\n');
      expect(styles).not.toContain('right: 16px !important');
      expect(styles).not.toContain('left: auto !important');
    });

    describe('Short landscape screens', () => {
      const shortLandscapeQuery = '@media (min-width: 641px) and (max-width: 1023px) and (max-height: 500px)';
      const renderedStyles = () => Array.from(document.querySelectorAll('style'))
        .map((style) => style.textContent || '')
        .join('\n');

      it('should fill the visible height to the left of a right-side trigger', () => {
        render(<ChatWindow {...defaultProps} position="top-right" right_offset={52} bottom_offset={60} />);

        const styles = renderedStyles();
        expect(styles).toContain(shortLandscapeQuery);
        expect(styles).toContain(`top: ${visualViewportInset('top', 'var(--cl-top-gap)')} !important`);
        expect(styles).toContain(`bottom: ${visualViewportInset('bottom', 'var(--cl-window-gap)')} !important`);
        // jsdom has no layout, so the trigger size is the 48 px default.
        const besideTrigger = `calc(${safeAreaGap('right', '52px')} + 48px + 12px)`;
        expect(styles).toContain(`right: ${visualViewportInset('right', besideTrigger)} !important`);
        expect(styles).toContain(
          `width: min(420px, 85vw, calc(var(--cl-visual-viewport-width, 100vw) - ${besideTrigger} - max(8px, var(--cl-safe-area-left, 0px)))) !important`
        );
        expect(styles).not.toContain(`left: ${visualViewportInset('left', 'calc(')}`);
        const chatWindow = document.querySelector<HTMLElement>('.cl-chat-window')!;
        expect(chatWindow.style.getPropertyValue('--cl-bottom-offset')).toBe(safeAreaGap('bottom', '60px'));
      });

      it('should keep the bottom level with the trigger while 240 px fit', () => {
        render(<ChatWindow {...defaultProps} bottom_offset={285} />);

        const styles = renderedStyles();
        expect(styles).toContain('--cl-trigger-gap: var(--cl-bottom-offset);');
        expect(styles).toContain('calc(var(--cl-visible-height) - var(--cl-trigger-gap) - var(--cl-top-gap))');
        expect(styles).toContain('min(240px, calc(var(--cl-visible-height) - var(--cl-top-gap) - 8px))');
      });

      it('should fill the visible height to the right of a left-side trigger', () => {
        render(<ChatWindow {...defaultProps} position="bottom-left" left_offset={64} />);

        const styles = renderedStyles();
        expect(styles).toContain(shortLandscapeQuery);
        expect(styles).toContain(`left: ${visualViewportInset('left', `calc(${safeAreaGap('left', '64px')} + 48px + 12px)`)} !important`);
        expect(styles).not.toContain(`right: ${visualViewportInset('right', 'calc(')}`);
      });

      it('should keep the gap from the rendered trigger size', () => {
        const largeTriggerRef = {
          current: { ...mockTriggerRef.current, offsetWidth: 64, offsetHeight: 64 },
        } as unknown as React.RefObject<HTMLButtonElement>;
        render(<ChatWindow {...defaultProps} triggerRef={largeTriggerRef} />);

        expect(renderedStyles()).toContain(`right: ${visualViewportInset('right', `calc(${safeAreaGap('right', '20px')} + 64px + 12px)`)} !important`);
      });

      it('should keep an anchored window in its place', () => {
        render(
          <ChatWindow
            {...defaultProps}
            positionOverrideStyle={{ top: '96px', left: '24px', right: 'auto', bottom: 'auto' }}
          />
        );

        expect(renderedStyles()).not.toContain(shortLandscapeQuery);
      });
    });

    describe('Scaled page (#82)', () => {
      // width=320 on a 740 x 360 phone in landscape. Media queries see the
      // 320 px page, so the rules for the frame size come without @media.
      const landscape = { scale: 2.3125, width: 740, height: 361 };
      const renderedStyles = () => Array.from(document.querySelectorAll('style'))
        .map((style) => style.textContent || '')
        .join('\n');

      it('should use the short landscape rules of the screen size', () => {
        render(<ChatWindow {...defaultProps} scaledPage={landscape} />);

        const styles = renderedStyles();
        expect(styles).not.toMatch(/@media \((min|max)-(width|height)/);
        expect(styles).not.toMatch(/[0-9]v[wh]\b/);
        expect(styles).toContain('--cl-trigger-gap: var(--cl-bottom-offset);');
        expect(styles).toContain(`top: ${visualViewportInset('top', 'var(--cl-top-gap)')} !important`);
        expect(styles).toContain(
          `width: min(420px, 629px, calc(var(--cl-visual-viewport-width, 740px) - calc(${safeAreaGap('right', '20px')} + 48px + 12px) - max(8px, var(--cl-safe-area-left, 0px)))) !important`
        );
        // The phone rules of the 320 px page are gone.
        expect(styles).not.toContain('--cl-trigger-room');
      });

      it('should use the phone rules on a scaled portrait page', () => {
        render(<ChatWindow {...defaultProps} scaledPage={{ scale: 1.21875, width: 390, height: 843 }} />);

        const styles = renderedStyles();
        expect(styles).toContain('height: calc(var(--cl-visual-viewport-height, 100%) - var(--cl-trigger-room');
        expect(styles).not.toContain('--cl-window-room');
      });

      it('should take the visible part of the page from the frame', () => {
        render(<ChatWindow {...defaultProps} scaledPage={landscape} />);

        const chatWindow = document.querySelector<HTMLElement>('.cl-chat-window')!;
        expect(chatWindow.style.getPropertyValue('--cl-visual-viewport-left')).toBe('0px');
        expect(chatWindow.style.getPropertyValue('--cl-visual-viewport-top')).toBe('0px');
        expect(chatWindow.style.getPropertyValue('--cl-visual-viewport-width')).toBe('var(--cl-frame-width, 740px)');
        expect(chatWindow.style.getPropertyValue('--cl-visual-viewport-height')).toBe('var(--cl-frame-height, 361px)');
        expect(chatWindow.style.maxHeight).toBe('252.7px');
        expect(chatWindow.style.maxWidth).toBe('666px');
      });
    });

    it('should render window title', () => {
      render(<ChatWindow {...defaultProps} window_title="Test Chat" />);

      expect(screen.getByText('Test Chat')).toBeInTheDocument();
    });

    it('should render input field', () => {
      render(<ChatWindow {...defaultProps} />);

      const input = document.querySelector('.cl-input-element');
      expect(input).toBeInTheDocument();
    });

    it('should set a readable default input text size', () => {
      render(<ChatWindow {...defaultProps} />);

      const input = document.querySelector('.cl-input-element');
      expect(input).toHaveStyle({ fontSize: '16px', lineHeight: '1.5' });
    });

    it('should allow custom input text size overrides', () => {
      render(
        <ChatWindow
          {...defaultProps}
          input_style={{ fontSize: '18px', lineHeight: '1.8' }}
        />
      );

      const input = document.querySelector('.cl-input-element');
      expect(input).toHaveStyle({ fontSize: '18px', lineHeight: '1.8' });
    });

    it('should render send button', () => {
      render(<ChatWindow {...defaultProps} />);

      const sendButton = document.querySelector('.cl-send-button');
      expect(sendButton).toBeInTheDocument();
    });

    it('should keep the send button circular by preventing flex shrinking', () => {
      render(<ChatWindow {...defaultProps} />);

      const sendButton = document.querySelector('.cl-send-button');
      expect(sendButton).toHaveStyle({ width: '40px', height: '40px', flexShrink: '0' });
    });
  });

  describe('Welcome Message', () => {
    it('should show welcome message when no messages', () => {
      render(<ChatWindow {...defaultProps} messages={[]} />);

      // The mocked ChatMessage will show the welcome message
      expect(screen.getByTestId('bot-message')).toBeInTheDocument();
    });

    it('should show custom welcome message', () => {
      render(<ChatWindow {...defaultProps} messages={[]} welcome_message="Welcome to our chat!" />);

      expect(screen.getByText('Welcome to our chat!')).toBeInTheDocument();
    });
  });

  describe('Messages', () => {
    it('should render messages from props', () => {
      const messages = [
        { message: 'Hello', isSend: true },
        { message: 'Hi there!', isSend: false }
      ];

      render(<ChatWindow {...defaultProps} messages={messages} />);

      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });

    it('should show user messages with user-message testid', () => {
      const messages = [{ message: 'User message', isSend: true }];

      render(<ChatWindow {...defaultProps} messages={messages} />);

      expect(screen.getByTestId('user-message')).toBeInTheDocument();
    });

    it('should show bot messages with bot-message testid', () => {
      const messages = [{ message: 'Bot message', isSend: false }];

      render(<ChatWindow {...defaultProps} messages={messages} />);

      // Note: two bot messages - welcome + the actual one
      const botMessages = screen.getAllByTestId('bot-message');
      expect(botMessages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Message List Scrolling', () => {
    const scrollTo = Element.prototype.scrollTo as jest.Mock;

    beforeEach(() => {
      // jsdom has no layout. Give every element a known content height.
      jest.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(640);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should scroll only the message list to its end when messages change', () => {
      const { rerender } = render(<ChatWindow {...defaultProps} />);
      scrollTo.mockClear();

      rerender(
        <ChatWindow {...defaultProps} messages={[{ message: 'Assistant reply', isSend: false }]} />
      );

      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.contexts[0]).toHaveClass('cl-messages_container');
      expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'smooth' });
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    it('should follow a streamed message as its text grows', () => {
      const streamed = (text: string): ChatMessageType[] => [
        { message: 'Question', isSend: true },
        { message: text, isSend: false, message_id: 'stream', streaming: true },
      ];
      const { rerender } = render(<ChatWindow {...defaultProps} messages={streamed('Partial')} />);
      scrollTo.mockClear();

      rerender(<ChatWindow {...defaultProps} messages={streamed('Partial answer, now longer')} />);

      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.contexts[0]).toHaveClass('cl-messages_container');
      // A streamed answer is pinned at once, without a running smooth scroll.
      expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' });
    });

    // jsdom has no scrolling: set the list's position and report a scroll.
    const scrollListTo = (list: HTMLElement, top: number) => {
      Object.defineProperty(list, 'scrollTop', { configurable: true, writable: true, value: top });
      fireEvent.scroll(list);
    };

    const streamedAnswer = (text: string): ChatMessageType[] => [
      { message: 'Question', isSend: true },
      { message: text, isSend: false, message_id: 'stream', streaming: true },
    ];

    it('should stop following the stream when the visitor scrolls up, and lead back', () => {
      jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(200);
      const { rerender } = render(<ChatWindow {...defaultProps} messages={streamedAnswer('Partial')} />);
      const list = document.querySelector('.cl-messages_container') as HTMLElement;

      // At the end (640 - 200 = 440), then the visitor scrolls up to read.
      scrollListTo(list, 440);
      scrollListTo(list, 100);
      scrollTo.mockClear();

      rerender(<ChatWindow {...defaultProps} messages={streamedAnswer('Partial answer, now longer')} />);
      expect(scrollTo).not.toHaveBeenCalled();

      const jump = screen.getByRole('button', { name: 'Jump to the newest message' });
      fireEvent.click(jump);
      expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'smooth' });
      expect(screen.queryByRole('button', { name: 'Jump to the newest message' })).not.toBeInTheDocument();
    });

    it('should offer the way back once the stream grows far below a visitor who scrolled up a little', () => {
      const height = jest.spyOn(Element.prototype, 'scrollHeight', 'get');
      jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(200);
      const { rerender } = render(<ChatWindow {...defaultProps} messages={streamedAnswer('Partial')} />);
      const list = document.querySelector('.cl-messages_container') as HTMLElement;

      // 100px above the end (440): the list stops following, no button yet.
      scrollListTo(list, 440);
      scrollListTo(list, 340);
      expect(screen.queryByRole('button', { name: 'Jump to the newest message' })).not.toBeInTheDocument();

      // The answer grows by 200px. No scroll event fires, the visitor stays.
      height.mockReturnValue(840);
      scrollTo.mockClear();
      rerender(<ChatWindow {...defaultProps} messages={streamedAnswer('Partial answer, now much longer')} />);

      expect(scrollTo).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Jump to the newest message' })).toBeInTheDocument();
    });

    it('should follow again when the visitor scrolls back to the end', () => {
      jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(200);
      const { rerender } = render(<ChatWindow {...defaultProps} messages={streamedAnswer('Partial')} />);
      const list = document.querySelector('.cl-messages_container') as HTMLElement;

      scrollListTo(list, 440);
      scrollListTo(list, 100);
      scrollListTo(list, 400);
      scrollTo.mockClear();

      rerender(<ChatWindow {...defaultProps} messages={streamedAnswer('Partial answer, now longer')} />);
      expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' });
    });

    it('should stop following when the next word comes before the scroll event of the visitor', () => {
      jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(200);
      const { rerender } = render(<ChatWindow {...defaultProps} messages={streamedAnswer('Partial')} />);
      const list = document.querySelector('.cl-messages_container') as HTMLElement;
      scrollListTo(list, 440);
      scrollTo.mockClear();

      // The visitor scrolls up; the browser fires the scroll event one frame later.
      Object.defineProperty(list, 'scrollTop', { configurable: true, writable: true, value: 100 });
      rerender(<ChatWindow {...defaultProps} messages={streamedAnswer('Partial answer, now longer')} />);

      expect(scrollTo).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Jump to the newest message' })).toBeInTheDocument();
    });

    it('should show the visitor their own new message, even after scrolling up', () => {
      jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(200);
      const answered: ChatMessageType[] = [
        { message: 'Question', isSend: true },
        { message: 'Answer', isSend: false },
      ];
      const { rerender } = render(<ChatWindow {...defaultProps} messages={answered} />);
      const list = document.querySelector('.cl-messages_container') as HTMLElement;

      scrollListTo(list, 440);
      scrollListTo(list, 100);
      scrollTo.mockClear();

      rerender(<ChatWindow {...defaultProps} messages={[...answered, { message: 'Next question', isSend: true }]} />);
      expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'smooth' });
    });

    describe('when the list gets shorter (the on-screen keyboard opens)', () => {
      // jsdom has no ResizeObserver. This one reports a resize of the list on demand.
      const resized: Array<() => void> = [];
      beforeEach(() => {
        class FakeResizeObserver {
          constructor(private callback: ResizeObserverCallback) {}
          observe(element: Element) {
            if (element.classList?.contains('cl-messages_container')) {
              resized.push(() => this.callback([], this as unknown as ResizeObserver));
            }
          }
          disconnect() {}
        }
        (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
      });
      afterEach(() => {
        resized.splice(0);
        delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
      });

      const answered: ChatMessageType[] = [
        { message: 'Question', isSend: true },
        { message: 'Answer', isSend: false },
      ];

      it('should keep the newest message in view for a visitor at the end', () => {
        const clientHeight = jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(500);
        render(<ChatWindow {...defaultProps} messages={answered} />);
        const list = document.querySelector('.cl-messages_container') as HTMLElement;
        scrollListTo(list, 140);

        // The keyboard takes 300 px. The browser keeps scrollTop, so the end is hidden.
        clientHeight.mockReturnValue(200);
        act(() => resized.forEach((resize) => resize()));

        expect(list.scrollTop).toBe(640);
        expect(screen.queryByRole('button', { name: 'Jump to the newest message' })).not.toBeInTheDocument();
      });

      it('should keep the place of a visitor who scrolled up, and lead back', () => {
        const clientHeight = jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(300);
        render(<ChatWindow {...defaultProps} messages={answered} />);
        const list = document.querySelector('.cl-messages_container') as HTMLElement;
        // 100 px above the end (640 - 300 - 240): the list stops following, no button yet.
        scrollListTo(list, 340);
        scrollListTo(list, 240);
        expect(screen.queryByRole('button', { name: 'Jump to the newest message' })).not.toBeInTheDocument();

        // The keyboard takes 150 px: the newest message is 250 px below the visible list.
        clientHeight.mockReturnValue(150);
        act(() => resized.forEach((resize) => resize()));

        expect(list.scrollTop).toBe(240);
        expect(screen.getByRole('button', { name: 'Jump to the newest message' })).toBeInTheDocument();
      });

      it('should not scroll when the list gets taller (the keyboard closes)', () => {
        const clientHeight = jest.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(200);
        render(<ChatWindow {...defaultProps} messages={answered} />);
        const list = document.querySelector('.cl-messages_container') as HTMLElement;
        scrollListTo(list, 300);

        clientHeight.mockReturnValue(500);
        act(() => resized.forEach((resize) => resize()));

        expect(list.scrollTop).toBe(300);
      });
    });
  });

  describe('Suggested questions and the newest answer', () => {
    it('should show up to four suggested questions before the conversation starts', () => {
      render(
        <ChatWindow
          {...defaultProps}
          suggestions={['Opening hours', '  ', 'Tickets for families', 'Wheelchair access', 'Parking', 'Groups']}
        />
      );

      const group = screen.getByRole('group', { name: 'Suggested questions' });
      expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual([
        'Opening hours', 'Tickets for families', 'Wheelchair access', 'Parking',
      ]);
    });

    it('should name the suggestions in German', () => {
      render(<ChatWindow {...defaultProps} language="de" suggestions={['Öffnungszeiten']} />);

      expect(screen.getByRole('group', { name: 'Vorgeschlagene Fragen' })).toBeInTheDocument();
    });

    it('should use button_color for the chip border only, so the text stays readable', () => {
      render(<ChatWindow {...defaultProps} button_color="#7c2d12" suggestions={['Opening hours']} />);

      const group = screen.getByRole('group', { name: 'Suggested questions' });
      expect(group.style.getPropertyValue('--cl-chip-line')).toBe('#7c2d12');
      expect(group.style.getPropertyValue('--cl-chip-ink')).toBe('');
    });

    it('should darken a light button_color for the chip border until it reaches 3:1 on the list', () => {
      render(<ChatWindow {...defaultProps} button_color="#fde68a" suggestions={['Opening hours']} />);

      const group = screen.getByRole('group', { name: 'Suggested questions' });
      // #fde68a reads at 1.3:1 on the list (#f8fafc); the same yellow, darker, reaches 3:1.
      expect(group.style.getPropertyValue('--cl-chip-line')).toBe('#988a53');
    });

    it('should send a suggested question when the visitor taps it', async () => {
      const addMessage = jest.fn();
      mockedStreamMessage.mockImplementationOnce(() => new Promise(() => {}));
      render(
        <ChatWindow {...defaultProps} enable_streaming={true} addMessage={addMessage} suggestions={['Opening hours']} />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Opening hours' }));

      expect(addMessage).toHaveBeenCalledWith({ message: 'Opening hours', isSend: true });
      expect(mockedStreamMessage.mock.calls[0][2]).toBe('Opening hours');
      // While the answer is on its way, the questions cannot send again.
      await waitFor(() => expect(screen.getByRole('button', { name: 'Opening hours' })).toBeDisabled());
    });

    it('should hide the suggestions once the conversation has started', () => {
      render(
        <ChatWindow
          {...defaultProps}
          messages={[{ message: 'Hello', isSend: true }]}
          suggestions={['Opening hours']}
        />
      );

      expect(screen.queryByRole('group', { name: 'Suggested questions' })).not.toBeInTheDocument();
    });

    it('should mark only the newest answer, not errors or questions', () => {
      render(
        <ChatWindow
          {...defaultProps}
          messages={[
            { message: 'First question', isSend: true },
            { message: 'First answer', isSend: false },
            { message: 'Second question', isSend: true },
            { message: 'Second answer', isSend: false },
            { message: 'Third question', isSend: true },
            { message: 'The assistant could not be reached.', isSend: false, error: true },
          ]}
        />
      );

      const latest = Array.from(document.querySelectorAll('[data-latest="true"]'));
      expect(latest.map((element) => element.textContent)).toEqual(['Second answer']);
    });
  });

  describe('Input Handling', () => {
    it('should update input value on change', () => {
      render(<ChatWindow {...defaultProps} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Test message' } });

      expect(input.value).toBe('Test message');
    });

    it('should show placeholder text', () => {
      render(<ChatWindow {...defaultProps} placeholder="Enter your message" />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      expect(input.placeholder).toBe('Enter your message');
    });

    it('should show placeholder_sending in the enabled input while the assistant answers', async () => {
      mockedSendMessage.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={false}
          placeholder="Ask about tickets"
          placeholder_sending="Sending..."
        />
      );

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;
      expect(input.placeholder).toBe('Ask about tickets');

      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(sendButton).toBeDisabled();
      });
      expect(input).not.toBeDisabled();
      expect(input.placeholder).toBe('Sending...');
      // The thinking bubble keeps its own phrases.
      expect(screen.getByTestId('chat-placeholder')).toHaveTextContent('Loading...');
    });

    it('should keep the normal placeholder while sending without placeholder_sending', async () => {
      mockedSendMessage.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ChatWindow {...defaultProps} enable_streaming={false} placeholder="Ask about tickets" />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(sendButton).toBeDisabled();
      });
      expect(input.placeholder).toBe('Ask about tickets');
    });
  });

  describe('Input Autofocus', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('should preserve hint focus while the chat is closed', () => {
      const { rerender } = render(
        <>
          <button>Scroll the hint</button>
          <ChatWindow {...defaultProps} open={false} />
        </>
      );
      const hint = screen.getByRole('button', { name: 'Scroll the hint' });
      hint.focus();

      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(hint).toHaveFocus();

      rerender(
        <>
          <button>Scroll the hint</button>
          <ChatWindow
            {...defaultProps}
            open={false}
            messages={[{ message: 'Assistant reply', isSend: false }]}
          />
        </>
      );
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(hint).toHaveFocus();
    });

    it('should focus the input 100 milliseconds after opening', () => {
      const { rerender } = render(
        <>
          <button>Scroll the hint</button>
          <ChatWindow {...defaultProps} open={false} />
        </>
      );
      const hint = screen.getByRole('button', { name: 'Scroll the hint' });
      hint.focus();

      rerender(
        <>
          <button>Scroll the hint</button>
          <ChatWindow {...defaultProps} open={true} />
        </>
      );
      act(() => {
        jest.advanceTimersByTime(99);
      });
      expect(hint).toHaveFocus();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('should focus the input without scrolling the host page', () => {
      render(<ChatWindow {...defaultProps} open={true} />);
      const focus = jest.spyOn(screen.getByRole('textbox'), 'focus');

      try {
        act(() => {
          jest.advanceTimersByTime(100);
        });

        expect(focus).toHaveBeenCalledTimes(1);
        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      } finally {
        focus.mockRestore();
      }
    });

    it('should cancel pending input focus when the chat closes', () => {
      const { rerender } = render(
        <>
          <button>Scroll the hint</button>
          <ChatWindow {...defaultProps} open={true} />
        </>
      );
      act(() => {
        jest.advanceTimersByTime(50);
      });

      rerender(
        <>
          <button>Scroll the hint</button>
          <ChatWindow {...defaultProps} open={false} />
        </>
      );
      const hint = screen.getByRole('button', { name: 'Scroll the hint' });
      hint.focus();

      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(hint).toHaveFocus();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should cancel pending input focus when the chat unmounts', () => {
      const { unmount } = render(<ChatWindow {...defaultProps} open={true} />);
      const input = screen.getByRole('textbox');
      const focus = jest.spyOn(input, 'focus');

      act(() => {
        jest.advanceTimersByTime(50);
      });
      unmount();

      expect(jest.getTimerCount()).toBe(0);
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(focus).not.toHaveBeenCalled();
      focus.mockRestore();
    });
  });

  describe('Sending Messages (Non-Streaming)', () => {
    it('should retain the user message and append one error for empty assistant output', async () => {
      const history: ChatMessageType[] = [];
      const addMessage = jest.fn((message: ChatMessageType) => history.push(message));
      const updateLastMessage = jest.fn((message: ChatMessageType) => {
        history[history.length - 1] = message;
      });
      mockedSendMessage.mockResolvedValueOnce({
        data: { outputs: [], session_id: 'new-session' },
        status: 200,
        statusText: 'OK',
        headers: new Headers()
      });

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={false}
          addMessage={addMessage}
          updateLastMessage={updateLastMessage}
          enable_client_error_reporting={false}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(history).toEqual([
          { message: 'Hello', isSend: true },
          {
            message: 'The assistant did not return a response. Please try again.',
            isSend: false,
            error: true
          }
        ]);
      });

      expect(addMessage).toHaveBeenCalledTimes(2);
      expect(updateLastMessage).not.toHaveBeenCalled();
    });

    it('should call sendMessage when send button is clicked', async () => {
      mockedSendMessage.mockResolvedValueOnce(successfulNonStreamingResponse());

      render(<ChatWindow {...defaultProps} enable_streaming={false} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockedSendMessage).toHaveBeenCalledWith(
          'http://localhost:3000',
          'test-flow-id',
          'Hello',
          'chat',
          'chat',
          expect.any(Object),
          undefined,
          undefined,
          'test-api-key',
          undefined
        );
      });
    });

    it('should call addMessage with user message', async () => {
      const addMessage = jest.fn();
      mockedSendMessage.mockResolvedValueOnce(successfulNonStreamingResponse());

      render(<ChatWindow {...defaultProps} enable_streaming={false} addMessage={addMessage} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(addMessage).toHaveBeenCalledWith({
          message: 'Test message',
          isSend: true
        });
      });
    });

    it('should clear input after sending', async () => {
      mockedSendMessage.mockResolvedValueOnce(successfulNonStreamingResponse());

      render(<ChatWindow {...defaultProps} enable_streaming={false} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(sendButton);

      expect(input.value).toBe('');
    });

    it('should not send empty messages', () => {
      render(<ChatWindow {...defaultProps} />);

      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;
      fireEvent.click(sendButton);

      expect(mockedSendMessage).not.toHaveBeenCalled();
      expect(mockedStreamMessage).not.toHaveBeenCalled();
    });

    it('should not send whitespace-only messages', () => {
      render(<ChatWindow {...defaultProps} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(sendButton);

      expect(mockedSendMessage).not.toHaveBeenCalled();
      expect(mockedStreamMessage).not.toHaveBeenCalled();
    });

    it('should send message on Enter key press', async () => {
      mockedSendMessage.mockResolvedValueOnce(successfulNonStreamingResponse());

      render(<ChatWindow {...defaultProps} enable_streaming={false} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockedSendMessage).toHaveBeenCalled();
      });
    });

    it('should send a programmatic message', async () => {
      const addMessage = jest.fn();
      const onProgrammaticMessageHandled = jest.fn();
      mockedSendMessage.mockResolvedValueOnce(successfulNonStreamingResponse());

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={false}
          addMessage={addMessage}
          programmaticMessage={{ id: 1, message: 'Prefilled question' }}
          onProgrammaticMessageHandled={onProgrammaticMessageHandled}
        />
      );

      await waitFor(() => {
        expect(mockedSendMessage).toHaveBeenCalledWith(
          'http://localhost:3000',
          'test-flow-id',
          'Prefilled question',
          'chat',
          'chat',
          expect.any(Object),
          undefined,
          undefined,
          'test-api-key',
          undefined
        );
      });
      expect(addMessage).toHaveBeenCalledWith({
        message: 'Prefilled question',
        isSend: true
      });
      expect(onProgrammaticMessageHandled).toHaveBeenCalledWith(1);
    });

    it('should dispatch a client error event when sending fails before reaching the server', async () => {
      const clientError = Object.assign(new Error('Failed to read headers'), {
        code: 'ERR_INVALID_REQUEST_HEADER',
        headerName: 'X-Custom-Header'
      });
      const listener = jest.fn();
      mockedSendMessage.mockRejectedValueOnce(clientError);
      window.addEventListener('punku-chat-error', listener);

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={false}
          widget_id="custom-widget"
          enable_client_error_reporting={false}
        />
      );

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(listener).toHaveBeenCalledTimes(1);
      });

      const event = listener.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual(
        expect.objectContaining({
          event: 'punku-chat-error',
          phase: 'send-message',
          widgetId: 'custom-widget',
          flowId: 'test-flow-id',
          hostUrl: 'http://localhost:3000',
          sessionId: 'test-session-id',
        })
      );
      expect(event.detail.error).toEqual(
        expect.objectContaining({
          name: 'Error',
          message: 'Failed to read headers',
          code: 'ERR_INVALID_REQUEST_HEADER',
          headerName: 'X-Custom-Header',
        })
      );

      window.removeEventListener('punku-chat-error', listener);
    });

    it('should report client errors to the default host endpoint without host-page listeners', async () => {
      const clientError = Object.assign(new Error('Failed to read headers'), {
        code: 'ERR_INVALID_REQUEST_HEADER',
        headerName: 'X-Custom-Header'
      });
      const fetchMock = jest.fn<
        Promise<Response>,
        [RequestInfo | URL, RequestInit?]
      >(() => Promise.resolve({ ok: true } as Response));
      const originalFetch = global.fetch;
      const originalSendBeacon = navigator.sendBeacon;
      mockedSendMessage.mockRejectedValueOnce(clientError);
      global.fetch = fetchMock as unknown as typeof fetch;
      Object.defineProperty(navigator, 'sendBeacon', {
        configurable: true,
        value: undefined,
      });

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={false}
        />
      );

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:3000/api/v1/widget/client-errors',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: expect.any(String),
            keepalive: true,
          })
        );
      });

      const reportRequest = fetchMock.mock.calls[0]![1] as RequestInit;
      const reportBody = JSON.parse(reportRequest.body as string);
      expect(reportBody).toEqual(
        expect.objectContaining({
          message: 'Failed to read headers',
          flow_id: 'test-flow-id',
          widget_id: 'punku-chat-widget',
          session_id: 'test-session-id',
          error_type: 'ERR_INVALID_REQUEST_HEADER',
          status_code: null,
          run_url: 'http://localhost:3000/api/v1/run/test-flow-id',
          host_url: 'http://localhost:3000',
        })
      );
      expect(reportBody.details).toEqual(
        expect.objectContaining({
          phase: 'send-message',
          classification: 'invalid_request_header',
          error_code: 'ERR_INVALID_REQUEST_HEADER',
          header_name: 'X-Custom-Header',
          input_type: 'chat',
          output_type: 'chat',
          message_length: 5,
          streaming: false,
        })
      );
      expect(reportBody.details).not.toHaveProperty('authorization');

      if (originalFetch) {
        global.fetch = originalFetch;
      } else {
        delete (global as { fetch?: typeof fetch }).fetch;
      }
      Object.defineProperty(navigator, 'sendBeacon', {
        configurable: true,
        value: originalSendBeacon,
      });
    });
  });

  describe('Streaming Messages', () => {
    it('should call streamMessage when enable_streaming is true', async () => {
      mockedStreamMessage.mockImplementation(() => Promise.resolve());

      render(<ChatWindow {...defaultProps} enable_streaming={true} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockedStreamMessage).toHaveBeenCalled();
      });
    });

    it('should dispatch one client error event when streaming fails and rejects', async () => {
      const clientError = Object.assign(new Error('Failed to read headers'), {
        code: 'ERR_INVALID_REQUEST_HEADER',
        headerName: 'X-Custom-Header'
      });
      const listener = jest.fn();
      mockedStreamMessage.mockImplementationOnce((...args: any[]) => {
        const onStreamError = args[12] as (error: unknown) => void;
        onStreamError(clientError);
        return Promise.reject(clientError);
      });
      window.addEventListener('punku-chat-error', listener);

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={true}
          widget_id="custom-widget"
          enable_client_error_reporting={false}
        />
      );

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(listener).toHaveBeenCalledTimes(1);
      });

      const event = listener.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual(
        expect.objectContaining({
          event: 'punku-chat-error',
          phase: 'stream-message',
          widgetId: 'custom-widget',
          flowId: 'test-flow-id',
        })
      );
      expect(event.detail.error).toEqual(
        expect.objectContaining({
          code: 'ERR_INVALID_REQUEST_HEADER',
          headerName: 'X-Custom-Header',
        })
      );

      window.removeEventListener('punku-chat-error', listener);
    });

    it('should dispatch a client error event when streaming rejects before its error callback', async () => {
      const clientError = Object.assign(new Error('Failed to read headers'), {
        code: 'ERR_INVALID_REQUEST_HEADER',
        headerName: 'X-Custom-Header'
      });
      const listener = jest.fn();
      mockedStreamMessage.mockRejectedValueOnce(clientError);
      window.addEventListener('punku-chat-error', listener);

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={true}
          widget_id="custom-widget"
          enable_client_error_reporting={false}
        />
      );

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(listener).toHaveBeenCalledTimes(1);
      });

      const event = listener.mock.calls[0][0] as CustomEvent;
      expect(event.detail.phase).toBe('stream-message');
      expect(event.detail.error.headerName).toBe('X-Custom-Header');

      window.removeEventListener('punku-chat-error', listener);
    });

    it('should complete a normal stream with visible assistant text', async () => {
      const addMessage = jest.fn();
      const updateLastMessage = jest.fn();
      mockedStreamMessage.mockImplementationOnce((...args: any[]) => {
        const onStreamData = args[10] as (data: any) => void;
        const onStreamEnd = args[11] as (terminal: 'end') => void;

        onStreamData({
          event: 'add_message',
          data: { sender: 'Machine', id: 'assistant-message', text: 'Hello back' }
        });
        onStreamData({ event: 'end', data: { result: { session_id: 'next-session' } } });
        onStreamEnd('end');
        return Promise.resolve();
      });

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={true}
          addMessage={addMessage}
          updateLastMessage={updateLastMessage}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(updateLastMessage).toHaveBeenCalledWith({
          message: 'Hello back',
          message_id: 'assistant-message',
          isSend: false,
          streaming: false
        });
      });

      expect(addMessage).toHaveBeenCalledWith({
        message: 'Hello back',
        message_id: 'assistant-message',
        isSend: false,
        streaming: true
      });
      expect(mockSessionId.current).toBe('next-session');
    });

    it('should reject an end event without visible assistant text', async () => {
      const addMessage = jest.fn();
      mockedStreamMessage.mockImplementationOnce((...args: any[]) => {
        const onStreamData = args[10] as (data: any) => void;
        const onStreamEnd = args[11] as (terminal: 'end') => void;

        onStreamData({ event: 'end', data: { result: {} } });
        onStreamEnd('end');
        return Promise.resolve();
      });

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={true}
          addMessage={addMessage}
          enable_client_error_reporting={false}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(addMessage).toHaveBeenCalledWith({
          message: 'The assistant did not return a response. Please try again.',
          isSend: false,
          error: true
        });
      });
    });

    it('should hide a backend stream error behind the plain sentence and still report it', async () => {
      const addMessage = jest.fn();
      const listener = jest.fn();
      const technicalText = "Error building Component OpenAI Model: Error code: 401 - {'error': 'invalid key'}";
      mockedStreamMessage.mockImplementationOnce((...args: any[]) => {
        const onStreamData = args[10] as (data: any) => void;
        onStreamData({
          event: 'error',
          data: { text: technicalText }
        });
        return Promise.resolve();
      });

      window.addEventListener('punku-chat-error', listener);
      try {
        render(
          <ChatWindow
            {...defaultProps}
            enable_streaming={true}
            addMessage={addMessage}
            enable_client_error_reporting={false}
          />
        );

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'Hello' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
          expect(addMessage).toHaveBeenCalledWith({
            message: "Sorry, we're experiencing technical issues. Please try again.",
            isSend: false,
            error: true
          });
        });
        // The technical detail goes to client error reporting, never to the visitor.
        expect((listener.mock.calls[0][0] as CustomEvent).detail.error.message).toBe(technicalText);
      } finally {
        window.removeEventListener('punku-chat-error', listener);
      }
    });

    it.each([
      ['Provider quota exceeded', "Sorry, we're experiencing technical issues. Please try again."],
      [' \n ', "Sorry, we're experiencing technical issues. Please try again."]
    ])('should show one plain sentence for string stream error %j and retain the user message without replay', async (data, message) => {
      const addMessage = jest.fn();
      const updateLastMessage = jest.fn();
      const listener = jest.fn();
      const streamError = Object.assign(new Error(message), { code: 'ERR_BACKEND_STREAM' });
      mockedStreamMessage.mockImplementationOnce((...args: any[]) => {
        const onStreamData = args[10] as (data: any) => void;
        const onStreamError = args[12] as (error: unknown) => void;
        onStreamData({ event: 'error', data });
        onStreamError(streamError);
        return Promise.reject(streamError);
      });

      function StreamingChatHarness() {
        const [messages, setMessages] = React.useState<ChatMessageType[]>([]);
        return (
          <ChatWindow
            {...defaultProps}
            enable_streaming={true}
            messages={messages}
            addMessage={(newMessage: ChatMessageType) => {
              addMessage(newMessage);
              setMessages((previous) => [...previous, newMessage]);
            }}
            updateLastMessage={updateLastMessage}
            enable_client_error_reporting={false}
          />
        );
      }

      window.addEventListener('punku-chat-error', listener);
      try {
        render(<StreamingChatHarness />);

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'Hello' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        const messageList = document.querySelector('.cl-messages_container') as HTMLElement;
        await waitFor(() => {
          expect(within(messageList).getAllByText(message, { exact: true })).toHaveLength(1);
        });
        // Screen readers hear the same sentence once, from the status region.
        expect(screen.getByRole('status')).toHaveTextContent(message);

        expect(screen.getByText('Hello', { exact: true })).toBeInTheDocument();
        expect(addMessage.mock.calls).toEqual([
          [{ message: 'Hello', isSend: true }],
          [{ message, isSend: false, error: true }]
        ]);
        expect(updateLastMessage).not.toHaveBeenCalled();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(mockedStreamMessage).toHaveBeenCalledTimes(1);
        expect(mockedSendMessage).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('punku-chat-error', listener);
      }
    });

    it('should show an error when the stream ends without a terminal event', async () => {
      const addMessage = jest.fn();
      mockedStreamMessage.mockImplementationOnce((...args: any[]) => {
        const onStreamEnd = args[11] as (terminal?: 'end' | 'done') => void;
        onStreamEnd();
        return Promise.resolve();
      });

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={true}
          addMessage={addMessage}
          enable_client_error_reporting={false}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(addMessage).toHaveBeenCalledWith({
          message: 'The assistant response ended before it completed. Please try again.',
          isSend: false,
          error: true
        });
      });
    });
  });

  // The server sends checkout card facts in the content blocks of the agent
  // message (checkoutCards.ts). Made-up carts and experiences.
  describe('Checkout cards', () => {
    const cardUrl = 'https://eu5.bookingkit.de/cart/set/abcdefabcdefabcdefabcdefabcdef12?utm_source=web_chat&c=%5B%5D';
    const otherUrl = 'https://eu5.bookingkit.de/cart/set/3456789012345678901234567890abcd?utm_source=web_chat';
    const card = (url = cardUrl) => ({
      url, locale: 'de', bookings: [{ count: 2, unit: 'person' as const, product: 'Nachtführung in der Alten Mühle' }],
    });
    const blocks = [{
      title: 'Checkout',
      contents: [{ type: 'json', data: { kind: 'punku.checkout_card', v: 1, ...card() } }],
    }];
    const answer = `Ich habe 2 Tickets vorbereitet.\n\n**[Tickets buchen](${cardUrl})**`;

    const streamWith = (events: Array<Record<string, unknown>>, finish: 'end' | 'error' = 'end') =>
      mockedStreamMessage.mockImplementationOnce((...args: any[]) => {
        const onStreamData = args[10] as (data: any) => void;
        const onStreamEnd = args[11] as (terminal: 'end') => void;
        for (const data of events) onStreamData({ event: 'add_message', data: { sender: 'Machine', id: 'assistant-message', ...data } });
        if (finish === 'error') {
          onStreamData({ event: 'error', data: { text: 'synthetic failure' } });
        } else {
          onStreamData({ event: 'end', data: { result: {} } });
        }
        onStreamEnd('end');
        return Promise.resolve();
      });

    const ask = (props: Partial<React.ComponentProps<typeof ChatWindow>> = {}) => {
      const addMessage = jest.fn();
      const updateLastMessage = jest.fn();
      render(
        <ChatWindow {...defaultProps} enable_streaming={true} enable_client_error_reporting={false}
          addMessage={addMessage} updateLastMessage={updateLastMessage} {...props} />
      );
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Habt ihr am Samstag noch Plätze?' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      return { addMessage, updateLastMessage };
    };

    it('keeps a card that comes before the answer text on every update of the answer', async () => {
      // The block comes at the tool end, before the text, and again later.
      streamWith([
        { text: '', content_blocks: blocks },
        { text: 'Ich habe 2 Tickets', content_blocks: blocks },
        { text: answer },
      ]);
      const { addMessage, updateLastMessage } = ask();

      await waitFor(() => expect(updateLastMessage).toHaveBeenCalledWith(expect.objectContaining({ streaming: false })));
      expect(addMessage).toHaveBeenCalledWith({
        message: 'Ich habe 2 Tickets', message_id: 'assistant-message', isSend: false, streaming: true, checkoutCards: [card()],
      });
      expect(updateLastMessage.mock.calls.map(([message]) => message)).toEqual([
        { message: answer, message_id: 'assistant-message', isSend: false, streaming: true, checkoutCards: [card()] },
        { message: answer, message_id: 'assistant-message', isSend: false, streaming: false, checkoutCards: [card()] },
      ]);
    });

    it('adds a card that comes with a later part of the answer', async () => {
      streamWith([{ text: 'Ich habe' }, { text: answer, content_blocks: blocks }]);
      const { addMessage, updateLastMessage } = ask();

      await waitFor(() => expect(updateLastMessage).toHaveBeenCalledWith(expect.objectContaining({ streaming: false })));
      expect(addMessage).toHaveBeenCalledWith({ message: 'Ich habe', message_id: 'assistant-message', isSend: false, streaming: true });
      expect(updateLastMessage).toHaveBeenLastCalledWith({
        message: answer, message_id: 'assistant-message', isSend: false, streaming: false, checkoutCards: [card()],
      });
    });

    it('reads no card from tool output and adds no key without a card', async () => {
      const toolUse = [{
        title: 'Agent Steps',
        contents: [{ type: 'tool_use', output: { checkoutCard: { version: 1, bookings: card().bookings }, checkoutUrl: cardUrl } }],
      }];
      streamWith([{ text: answer, content_blocks: toolUse }]);
      const { addMessage, updateLastMessage } = ask();

      await waitFor(() => expect(updateLastMessage).toHaveBeenCalled());
      expect(addMessage).toHaveBeenCalledWith({ message: answer, message_id: 'assistant-message', isSend: false, streaming: true });
      expect(updateLastMessage).toHaveBeenLastCalledWith({ message: answer, message_id: 'assistant-message', isSend: false, streaming: false });
    });

    it('drops the card when the answer ends in an error', async () => {
      streamWith([{ text: answer, content_blocks: blocks }], 'error');
      const { updateLastMessage } = ask();

      await waitFor(() => expect(updateLastMessage).toHaveBeenCalled());
      expect(updateLastMessage).toHaveBeenLastCalledWith({
        message: "Sorry, we're experiencing technical issues. Please try again.",
        message_id: 'assistant-message', isSend: false, error: true,
      });
    });

    it('tells screen readers the answer once its final render shows the card', async () => {
      // Keeps the messages in state, like the widget, so the answer renders.
      function Chat() {
        const [messages, setMessages] = React.useState<ChatMessageType[]>([]);
        return (
          <ChatWindow {...defaultProps} enable_streaming={true} enable_client_error_reporting={false} messages={messages}
            addMessage={(message: ChatMessageType) => setMessages((previous) => [...previous, message])}
            updateLastMessage={(message: ChatMessageType) => setMessages((previous) => [...previous.slice(0, -1), message])} />
        );
      }
      streamWith([{ text: '', content_blocks: blocks }, { text: answer, content_blocks: blocks }]);
      render(<Chat />);
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Habt ihr am Samstag noch Plätze?' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ich habe 2 Tickets vorbereitet. CARD WORDS'));
    });

    it('tells screen readers the link text where no card shows', async () => {
      streamWith([{ text: answer, content_blocks: blocks }]);
      ask({ theme: 'swarovski' });

      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ich habe 2 Tickets vorbereitet. Tickets buchen'));
      expect(screen.getByRole('status')).not.toHaveTextContent('Nachtführung');
    });

    it('tells each answer whether it still streams', () => {
      render(<ChatWindow {...defaultProps} messages={[
        { message: 'Done', isSend: false, message_id: 'first', streaming: false },
        { message: 'Still writing', isSend: false, message_id: 'second', streaming: true },
      ]} />);

      expect(screen.getAllByTestId('bot-message').map((element) => element.getAttribute('data-streaming'))).toEqual([null, 'true']);
    });

    it('gives every answer the cards of the conversation, the chat language and the venue', () => {
      const messages: ChatMessageType[] = [
        { message: answer, isSend: false, message_id: 'first', checkoutCards: [card()] },
        { message: 'Und am Sonntag?', isSend: true },
        { message: 'Auch am Sonntag.', isSend: false, message_id: 'second', checkoutCards: [card(otherUrl)] },
        // Stored data is checked again: a card for another host never counts.
        { message: 'Noch etwas?', isSend: false, message_id: 'third', checkoutCards: [{ ...card(), url: 'https://example.com/cart' }] },
      ];
      const { rerender } = render(
        <ChatWindow {...defaultProps} messages={messages} language="it" checkout_card_venue="  Rocca di Esempio  " />
      );

      const answers = screen.getAllByTestId('bot-message');
      expect(answers).toHaveLength(3);
      for (const element of answers) {
        expect(element).toHaveAttribute('data-checkout-cards', `${cardUrl} ${otherUrl}`);
        expect(element).toHaveAttribute('data-checkout-language', 'it');
        expect(element).toHaveAttribute('data-checkout-venue', 'Rocca di Esempio');
      }

      rerender(<ChatWindow {...defaultProps} messages={messages} language="it" checkout_card_venue="   " />);
      expect(screen.getAllByTestId('bot-message')[0]).not.toHaveAttribute('data-checkout-venue');
    });
  });

  describe('Thinking and Error States', () => {
    const networkSentence = 'The assistant could not be reached. Check your connection and try again.';
    // The status region repeats a complete answer, so look for answers in the list.
    const inMessageList = (text: string) =>
      within(document.querySelector('.cl-messages_container') as HTMLElement).getByText(text);

    // Keeps the messages in state, like the widget does.
    function StatefulChat({
      sessionIsValid = () => true,
      onNewSession = () => {},
      ...props
    }: Partial<React.ComponentProps<typeof ChatWindow>> & {
      sessionIsValid?: () => boolean;
      onNewSession?: () => void;
    }) {
      const [messages, setMessages] = React.useState<ChatMessageType[]>([]);
      return (
        <ChatWindow
          {...defaultProps}
          enable_streaming={true}
          enable_client_error_reporting={false}
          {...props}
          messages={messages}
          addMessage={(message: ChatMessageType) => setMessages((previous) => [...previous, message])}
          updateLastMessage={(message: ChatMessageType) =>
            setMessages((previous) => [...previous.slice(0, -1), message])
          }
          removeLastMessage={() => setMessages((previous) => previous.slice(0, -1))}
          onSessionValidate={sessionIsValid}
          onStartNewSession={() => {
            onNewSession();
            setMessages([]);
          }}
        />
      );
    }

    const failStream = (error: unknown) => (...args: any[]) => {
      (args[12] as (error: unknown) => void)(error);
      return Promise.reject(error);
    };

    const answerStream = (text: string) => (...args: any[]) => {
      const onStreamData = args[10] as (data: any) => void;
      const onStreamEnd = args[11] as (terminal: 'end') => void;
      onStreamData({ event: 'add_message', data: { sender: 'Machine', id: 'assistant-message', text } });
      onStreamData({ event: 'end', data: { result: {} } });
      onStreamEnd('end');
      return Promise.resolve();
    };

    const send = (text: string) => {
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: text } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    };

    it('should let the visitor write while the assistant answers and send only afterwards', async () => {
      let answer: (response: ReturnType<typeof successfulNonStreamingResponse>) => void = () => {};
      mockedSendMessage
        .mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }) as any)
        .mockResolvedValueOnce(successfulNonStreamingResponse() as any);

      render(<ChatWindow {...defaultProps} enable_streaming={false} />);
      const input = screen.getByRole('textbox') as HTMLTextAreaElement;
      send('First question');
      await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledTimes(1));

      send('Second question');
      expect(input).not.toBeDisabled();
      expect(input.value).toBe('Second question');
      expect(mockedSendMessage).toHaveBeenCalledTimes(1);

      await act(async () => {
        answer(successfulNonStreamingResponse());
      });
      await waitFor(() => expect(document.querySelector('.cl-send-button')).not.toBeDisabled());

      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledTimes(2));
      expect(mockedSendMessage.mock.calls[1][2]).toBe('Second question');
      expect(input.value).toBe('');
    });

    it('should tell screen readers that the assistant writes, then read the complete answer once', async () => {
      let streamToken = (_text: string) => {};
      let finishStream = () => {};
      mockedStreamMessage.mockImplementationOnce((...args: any[]) => {
        const onStreamData = args[10] as (data: any) => void;
        streamToken = (text: string) =>
          onStreamData({ event: 'add_message', data: { sender: 'Machine', id: 'assistant-message', text } });
        finishStream = () => answerStream('Visit [our shop](https://example.com/shop) for **tickets**.')(...args);
        return Promise.resolve();
      });

      render(<ChatWindow {...defaultProps} enable_streaming={true} />);
      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status.textContent).toBe('');

      send('Hello');
      await waitFor(() => expect(status).toHaveTextContent('The assistant is writing'));

      // Streamed tokens are not announced.
      act(() => {
        streamToken('Visit');
      });
      expect(status).toHaveTextContent('The assistant is writing');

      act(() => {
        finishStream();
      });
      // The complete answer, as plain text without markdown marks.
      await waitFor(() => expect(status.textContent).toBe('Visit our shop for tickets.'));
    });

    it('should read a non-streaming answer to screen readers', async () => {
      mockedSendMessage.mockResolvedValueOnce(successfulNonStreamingResponse() as any);

      render(<ChatWindow {...defaultProps} enable_streaming={false} />);
      send('Hello');

      await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Assistant reply'));
    });

    it('should not announce messages restored from the session', () => {
      render(
        <ChatWindow
          {...defaultProps}
          messages={[
            { message: 'Hello', isSend: true },
            { message: 'Earlier answer', isSend: false },
            { message: 'Hello again', isSend: true },
            { message: networkSentence, isSend: false, error: true },
          ]}
        />
      );

      expect(screen.getByRole('status').textContent).toBe('');
    });

    it.each([
      [
        'a network failure',
        new TypeError('Failed to fetch'),
        'Der Assistent ist nicht erreichbar. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
      ],
      [
        'a server failure',
        new Error('HTTP error! status: 500, body: Internal Server Error'),
        'Entschuldigung, wir haben gerade technische Probleme. Bitte versuchen Sie es erneut.',
      ],
      [
        "a flow's own error text",
        Object.assign(new Error('Error building Component OpenAI Model: Error code: 401'), { code: 'ERR_BACKEND_STREAM' }),
        'Entschuldigung, wir haben gerade technische Probleme. Bitte versuchen Sie es erneut.',
      ],
      [
        'an interrupted answer',
        Object.assign(new Error('The assistant response ended before it completed.'), { code: 'ERR_PREMATURE_STREAM_END' }),
        'Die Antwort wurde abgebrochen, bevor sie fertig war. Bitte versuchen Sie es erneut.',
      ],
      [
        'an empty answer',
        Object.assign(new Error('The assistant did not return a response.'), { code: 'ERR_EMPTY_ASSISTANT_RESPONSE' }),
        'Der Assistent hat keine Antwort gesendet. Bitte versuchen Sie es erneut.',
      ],
    ])('should explain %s in plain German', async (_case, error, sentence) => {
      const addMessage = jest.fn();
      mockedStreamMessage.mockImplementationOnce(failStream(error));

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={true}
          language="de"
          addMessage={addMessage}
          enable_client_error_reporting={false}
        />
      );
      send('Hallo');

      await waitFor(() => {
        expect(addMessage).toHaveBeenCalledWith({ message: sentence, isSend: false, error: true });
      });
      expect(screen.getByRole('status')).toHaveTextContent(sentence);
    });

    it('should never show technical error text to the visitor', async () => {
      const addMessage = jest.fn();
      mockedSendMessage.mockRejectedValueOnce(new Error('HTTP error! status: 502, body: <html>Bad gateway</html>'));

      render(
        <ChatWindow
          {...defaultProps}
          enable_streaming={false}
          addMessage={addMessage}
          enable_client_error_reporting={false}
        />
      );
      send('Hello');

      await waitFor(() => {
        expect(addMessage).toHaveBeenCalledWith({
          message: "Sorry, we're experiencing technical issues. Please try again.",
          isSend: false,
          error: true,
        });
      });
    });

    it('should send the question again with Try again and replace the error with the answer', async () => {
      mockedStreamMessage
        .mockImplementationOnce(failStream(new TypeError('Failed to fetch')))
        .mockImplementationOnce(answerStream('Hello back'));

      render(<StatefulChat />);
      send('Hello');

      fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

      await waitFor(() => expect(inMessageList('Hello back')).toBeInTheDocument());
      const messageList = document.querySelector('.cl-messages_container') as HTMLElement;
      expect(within(messageList).queryByText(networkSentence)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      // The question is sent again, but its bubble is not repeated.
      expect(screen.getAllByTestId('user-message').map((message) => message.textContent)).toEqual(['Hello']);
      expect(mockedStreamMessage).toHaveBeenCalledTimes(2);
      expect(mockedStreamMessage.mock.calls[1][2]).toBe('Hello');
    });

    it('should show the question again when Try again starts a new session', async () => {
      let sessionValid = true;
      const onNewSession = jest.fn();
      mockedStreamMessage
        .mockImplementationOnce(failStream(new TypeError('Failed to fetch')))
        .mockImplementationOnce(answerStream('Hello back'));

      render(<StatefulChat sessionIsValid={() => sessionValid} onNewSession={onNewSession} />);
      send('Hello');
      const retryButton = await screen.findByRole('button', { name: 'Try again' });

      sessionValid = false;
      fireEvent.click(retryButton);

      await waitFor(() => expect(inMessageList('Hello back')).toBeInTheDocument());
      expect(onNewSession).toHaveBeenCalledTimes(1);
      expect(screen.getAllByTestId('user-message').map((message) => message.textContent)).toEqual(['Hello']);
    });

    it('should keep keyboard focus in the input when Try again removes its button', async () => {
      mockedStreamMessage
        .mockImplementationOnce(failStream(new TypeError('Failed to fetch')))
        .mockImplementationOnce(() => new Promise(() => {})); // The retry stays open.

      render(<StatefulChat />);
      send('Hello');
      const retryButton = await screen.findByRole('button', { name: 'Try again' });
      retryButton.focus();

      fireEvent.click(retryButton);

      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveFocus();
      expect(screen.getByRole('status')).toHaveTextContent('The assistant is writing');
    });

    it('should send only once when Try again is activated twice in one task', async () => {
      let finishRetry = () => {};
      mockedStreamMessage
        .mockImplementationOnce(failStream(new TypeError('Failed to fetch')))
        .mockImplementationOnce((...args: any[]) => {
          finishRetry = () => answerStream('Hello back')(...args);
          return Promise.resolve();
        });

      render(<StatefulChat />);
      send('Hello');
      const retryButton = await screen.findByRole('button', { name: 'Try again' });

      // Both clicks run before React renders the first one.
      act(() => {
        retryButton.click();
        retryButton.click();
      });

      expect(mockedStreamMessage).toHaveBeenCalledTimes(2);
      // The second click removed nothing: the question is still there.
      expect(screen.getAllByTestId('user-message').map((message) => message.textContent)).toEqual(['Hello']);

      act(() => {
        finishRetry();
      });
      expect(inMessageList('Hello back')).toBeInTheDocument();
    });

    it('should send only once when Enter is pressed twice in one task', () => {
      mockedStreamMessage.mockImplementationOnce(() => new Promise(() => {}));

      render(<StatefulChat />);
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'Hello' } });

      act(() => {
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      });

      expect(mockedStreamMessage).toHaveBeenCalledTimes(1);
      expect(screen.getAllByTestId('user-message')).toHaveLength(1);
    });

    it('should offer Try again only when the newest message is an error', () => {
      const messages: ChatMessageType[] = [
        { message: 'First', isSend: true },
        { message: networkSentence, isSend: false, error: true },
        { message: 'Second', isSend: true },
        { message: 'Answer', isSend: false },
      ];
      const removeLastMessage = jest.fn();
      const { rerender } = render(
        <ChatWindow {...defaultProps} messages={messages} removeLastMessage={removeLastMessage} />
      );
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

      rerender(
        <ChatWindow {...defaultProps} language="de" messages={messages.slice(0, 2)} removeLastMessage={removeLastMessage} />
      );
      expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();

      // Without a way to remove the error, there is no Try again.
      rerender(<ChatWindow {...defaultProps} messages={messages.slice(0, 2)} />);
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    });

    it('should refocus the input only after the answer is complete', () => {
      jest.useFakeTimers();
      try {
        let finishStream = () => {};
        mockedStreamMessage.mockImplementationOnce((...args: any[]) => {
          (args[10] as (data: any) => void)({
            event: 'add_message',
            data: { sender: 'Machine', id: 'assistant-message', text: 'Hello' },
          });
          finishStream = () => answerStream('Hello back')(...args);
          return Promise.resolve();
        });

        render(
          <>
            <button>Host page button</button>
            <StatefulChat />
          </>
        );
        const input = screen.getByRole('textbox');
        send('Hello');

        // The answer streams in while the visitor uses the host page.
        const hostButton = screen.getByRole('button', { name: 'Host page button' });
        hostButton.focus();
        act(() => {
          jest.advanceTimersByTime(500);
        });
        expect(hostButton).toHaveFocus();

        hostButton.blur();
        act(() => {
          finishStream();
        });
        act(() => {
          jest.advanceTimersByTime(100);
        });
        expect(input).toHaveFocus();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('Accessibility and focus', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      delete (window as any).matchMedia;
    });

    const runFocusTimer = () => {
      act(() => {
        jest.advanceTimersByTime(150);
      });
    };

    it('should name the message list as a log that does not announce by itself', () => {
      const { rerender } = render(<ChatWindow {...defaultProps} />);

      const log = screen.getByRole('log', { name: 'Conversation' });
      expect(log).toHaveClass('cl-messages_container');
      // The status region reads complete answers; the log would repeat them.
      expect(log).toHaveAttribute('aria-live', 'off');

      rerender(<ChatWindow {...defaultProps} language="de" />);
      expect(screen.getByRole('log', { name: 'Unterhaltung' })).toBeInTheDocument();
    });

    it('should return the focus to the launcher when the chat closes from inside', () => {
      const trigger = React.createRef<HTMLButtonElement>();
      const { rerender } = render(
        <>
          <button ref={trigger}>Launcher</button>
          <ChatWindow {...defaultProps} triggerRef={trigger} open={true} />
        </>
      );
      runFocusTimer();
      expect(screen.getByRole('textbox')).toHaveFocus();

      rerender(
        <>
          <button ref={trigger}>Launcher</button>
          <ChatWindow {...defaultProps} triggerRef={trigger} open={false} />
        </>
      );
      expect(trigger.current).toHaveFocus();
    });

    it('should leave the focus on the host page when the chat closes from there', () => {
      const trigger = React.createRef<HTMLButtonElement>();
      const { rerender } = render(
        <>
          <button ref={trigger}>Launcher</button>
          <input aria-label="Host search" />
          <ChatWindow {...defaultProps} triggerRef={trigger} open={true} />
        </>
      );
      runFocusTimer();
      const hostField = screen.getByRole('textbox', { name: 'Host search' });
      hostField.focus();

      rerender(
        <>
          <button ref={trigger}>Launcher</button>
          <input aria-label="Host search" />
          <ChatWindow {...defaultProps} triggerRef={trigger} open={false} />
        </>
      );
      expect(hostField).toHaveFocus();
    });

    it('should not take the focus from a host page field when an answer arrives', () => {
      const hostPage = (messages: ChatMessageType[]) => (
        <>
          <input aria-label="Host search" />
          <ChatWindow {...defaultProps} messages={messages} />
        </>
      );
      const { rerender } = render(hostPage([]));
      runFocusTimer();

      const hostField = screen.getByRole('textbox', { name: 'Host search' });
      hostField.focus();
      rerender(hostPage([{ message: 'Hello', isSend: true }, { message: 'Answer', isSend: false }]));
      runFocusTimer();

      expect(hostField).toHaveFocus();
    });

    it('should not take the focus from a link in the messages when an answer arrives', () => {
      const chat = (messages: ChatMessageType[]) => <ChatWindow {...defaultProps} messages={messages} />;
      const { rerender } = render(chat([]));
      runFocusTimer();

      // A focusable element inside the message list, as a link in an answer is.
      const list = document.querySelector('.cl-messages_container') as HTMLElement;
      const link = document.createElement('a');
      link.href = 'https://example.com/tickets';
      link.textContent = 'Tickets';
      list.appendChild(link);
      link.focus();

      rerender(chat([{ message: 'Answer', isSend: false }]));
      runFocusTimer();

      expect(link).toHaveFocus();
      link.remove();
    });

    it('should focus the input on opening, also when a message arrives in the first 100 ms', () => {
      const chat = (open: boolean, messages: ChatMessageType[]) => (
        <>
          <button>Open the chat</button>
          <ChatWindow {...defaultProps} open={open} messages={messages} />
        </>
      );
      const { rerender } = render(chat(false, []));
      // A host page button opens the chat and keeps the focus until then.
      screen.getByRole('button', { name: 'Open the chat' }).focus();

      rerender(chat(true, []));
      act(() => {
        jest.advanceTimersByTime(50);
      });
      rerender(chat(true, [{ message: 'Welcome back', isSend: false }]));
      runFocusTimer();

      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('should focus the input on opening, but not after an answer, on a touch screen', () => {
      (window as any).matchMedia = (query: string) => ({ matches: query === '(pointer: coarse)', media: query });
      const chat = (open: boolean, messages: ChatMessageType[]) => (
        <ChatWindow {...defaultProps} open={open} messages={messages} />
      );
      const { rerender } = render(chat(false, []));

      rerender(chat(true, []));
      runFocusTimer();
      const input = screen.getByRole('textbox');
      expect(input).toHaveFocus();

      input.blur();
      rerender(chat(true, [{ message: 'Answer', isSend: false }]));
      runFocusTimer();
      expect(input).not.toHaveFocus();
    });
  });

  describe('Session Management', () => {
    it('should show new session button when onStartNewSession is provided', () => {
      const onStartNewSession = jest.fn();

      render(<ChatWindow {...defaultProps} onStartNewSession={onStartNewSession} />);

      const newSessionBtn = document.querySelector('.cl-new-session-btn');
      expect(newSessionBtn).toBeInTheDocument();
    });

    it('should not show new session button when onStartNewSession is not provided', () => {
      render(<ChatWindow {...defaultProps} />);

      const newSessionBtn = document.querySelector('.cl-new-session-btn');
      expect(newSessionBtn).not.toBeInTheDocument();
    });

    it('should show confirmation modal when new session button is clicked', () => {
      const onStartNewSession = jest.fn();

      render(<ChatWindow {...defaultProps} onStartNewSession={onStartNewSession} />);

      const newSessionBtn = document.querySelector('.cl-new-session-btn') as HTMLButtonElement;
      fireEvent.click(newSessionBtn);

      expect(screen.getByTestId('confirmation-modal')).toBeInTheDocument();
    });

    it('should call onStartNewSession when confirmed', () => {
      const onStartNewSession = jest.fn();

      render(<ChatWindow {...defaultProps} onStartNewSession={onStartNewSession} />);

      const newSessionBtn = document.querySelector('.cl-new-session-btn') as HTMLButtonElement;
      fireEvent.click(newSessionBtn);

      const confirmBtn = screen.getByText('Confirm');
      fireEvent.click(confirmBtn);

      expect(onStartNewSession).toHaveBeenCalled();
    });

    it('should close modal when cancelled', () => {
      const onStartNewSession = jest.fn();

      render(<ChatWindow {...defaultProps} onStartNewSession={onStartNewSession} />);

      const newSessionBtn = document.querySelector('.cl-new-session-btn') as HTMLButtonElement;
      fireEvent.click(newSessionBtn);

      const cancelBtn = screen.getByText('Cancel');
      fireEvent.click(cancelBtn);

      expect(screen.queryByTestId('confirmation-modal')).not.toBeInTheDocument();
      expect(onStartNewSession).not.toHaveBeenCalled();
    });

    it.each([
      // The stylesheet red #dc2626 carries white text at 4.8:1.
      ['no site colours', {}, '', ''],
      // Dark text reads on the lighter red of v1.0.24, not on #dc2626.
      ['a dark button_text_color without button_color', { button_text_color: '#1C1C1C' }, '#ef4444', '#1C1C1C'],
      ['button_color and button_text_color', { button_color: '#9e183b', button_text_color: '#ffffff' }, '#9e183b', '#ffffff'],
      ['the swarovski theme', { theme: 'swarovski' as const }, '#ef4444', ''],
    ])('gives the dialog confirm button readable colours with %s', (_case, props, color, text) => {
      render(<ChatWindow {...defaultProps} {...props} onStartNewSession={jest.fn()} />);

      fireEvent.click(document.querySelector('.cl-new-session-btn') as HTMLButtonElement);

      const modal = screen.getByTestId('confirmation-modal');
      expect(modal).toHaveAttribute('data-button-color', color);
      expect(modal).toHaveAttribute('data-button-text-color', text);
    });

    it('should show session refresh message when isRefreshingSession is true', () => {
      render(<ChatWindow {...defaultProps} isRefreshingSession={true} />);

      expect(screen.getByText('Session refreshing...')).toBeInTheDocument();
    });
  });

  describe('Theming', () => {
    it('keeps the swarovski-widget branch look in the swarovski theme: text links and a paper plane', () => {
      const { unmount } = render(<ChatWindow {...defaultProps} theme="default" />);
      expect(screen.getByTestId('bot-message')).toHaveAttribute('data-link-buttons', 'true');
      // eslint-disable-next-line testing-library/no-node-access
      expect(document.querySelector('.cl-send-icon')).toHaveClass('lucide-arrow-up');
      unmount();

      render(<ChatWindow {...defaultProps} theme="swarovski" />);
      expect(screen.getByTestId('bot-message')).toHaveAttribute('data-link-buttons', 'false');
      // eslint-disable-next-line testing-library/no-node-access
      const icon = document.querySelector('.cl-send-icon')!;
      expect(icon).toHaveClass('lucide-send');
      expect(icon).toHaveStyle({ width: '18px', height: '18px' });
    });

    it('should apply theme class', () => {
      render(<ChatWindow {...defaultProps} theme="dark" />);

      const window = document.querySelector('.cl-window');
      expect(window).toHaveClass('theme-dark');
    });

    it('should apply custom-theme class when custom colors are provided', () => {
      render(<ChatWindow {...defaultProps} button_color="#ff0000" />);

      const window = document.querySelector('.cl-window');
      expect(window).toHaveClass('custom-theme');
    });

    it('should give link buttons the button colours of the site', () => {
      render(<ChatWindow {...defaultProps} button_color="#7c2d12" button_text_color="#fff7ed" />);

      const window = document.querySelector('.cl-window') as HTMLElement;
      expect(window.style.getPropertyValue('--cl-accent')).toBe('#7c2d12');
      expect(window.style.getPropertyValue('--cl-on-accent')).toBe('#fff7ed');
    });

    // The links rule: the answer's text colour (inherit), a readable shade of
    // the bubble when that text colour does not read either, or nothing.
    it.each([
      ['a dark red bot_message_color with white text', { bot_message_color: '#791f0d', bot_message_text_color: '#ffffff' }, 'inherit'],
      ['a dark red background and white text in bot_message_style', { bot_message_style: { backgroundColor: '#791f0d', color: '#ffffff' } }, 'inherit'],
      // Without a text colour the theme's dark text does not read on dark red
      // either: links take a light shade of the red (4.6:1).
      ['a dark red bot_message_color without a text colour', { bot_message_color: '#791f0d' }, '#c9a59e'],
      // White text on a mid green reads at 3:1 only: links take a dark green.
      ['a mid green bot_message_color with white text', { bot_message_color: '#3aaa35', bot_message_text_color: '#ffffff' }, '#113310'],
      ['a gradient that cannot be read', { bot_message_style: { background: 'linear-gradient(#fff, #eee)' } }, 'inherit'],
      ['a light blue bot_message_color', { bot_message_color: '#EAF1FF' }, null],
      ['a dark bot_message_color in the dark theme', { bot_message_color: '#1F2937', theme: 'dark' as const }, null],
      ['a dark red bot_message_color with link_color', { bot_message_color: '#791f0d', link_color: '#fde68a' }, null],
      ['no own bubble colour', {}, null],
    ])('should let links take the bubble text colour with %s: %s', (_case, props, color) => {
      render(<ChatWindow {...defaultProps} {...props} />);

      const styles = Array.from(document.querySelectorAll('style')).map((style) => style.textContent || '').join('\n');
      const rule = /\.cl-window \.cl-bot_message \.markdown-body a \{\n\s*color: ([^ ]+) !important;/.exec(styles);
      expect(rule ? rule[1] : null).toBe(color);
    });

    it('should keep a site link colour opaque on hover', () => {
      // #c74388 reads at 4.6:1 on white; 80% opacity on hover would take it to 3.4:1.
      render(<ChatWindow {...defaultProps} link_color="#c74388" />);

      const styles = Array.from(document.querySelectorAll('style')).map((style) => style.textContent || '').join('\n');
      const hover = /\.cl-window \.markdown-body a:hover \{([^}]*)\}/.exec(styles);
      expect(hover?.[1]).toContain('color: #c74388 !important');
      expect(hover?.[1]).not.toContain('opacity');
    });

    it('should keep the theme accent for link buttons without button_color', () => {
      render(<ChatWindow {...defaultProps} />);

      const window = document.querySelector('.cl-window') as HTMLElement;
      expect(window.style.getPropertyValue('--cl-accent')).toBe('');
    });

    it('should render header with custom icon', () => {
      render(<ChatWindow {...defaultProps} header_icon="https://example.com/icon.png" />);

      const headerIcon = document.querySelector('.cl-header-logo');
      expect(headerIcon).toBeInTheDocument();
      expect(headerIcon?.tagName.toLowerCase()).toBe('img');
    });

    it('should render header with custom lucide icon name', () => {
      render(<ChatWindow {...defaultProps} header_icon_name="Bot" />);

      const headerIcon = document.querySelector('.cl-header-logo');
      expect(headerIcon).toBeInTheDocument();
      expect(headerIcon?.tagName.toLowerCase()).toBe('svg');
    });
  });

  // Issue #70: the header icons follow the header colour rule.
  describe('Header icon colour', () => {
    const renderHeader = (props: Partial<React.ComponentProps<typeof ChatWindow>>) =>
      render(
        <ChatWindow {...defaultProps} onStartNewSession={jest.fn()} onClose={jest.fn()} {...props} />
      );

    // The header icon, then the new-chat and close icons.
    const headerIconStrokes = () =>
      ['.cl-header-logo', '.cl-new-session-btn svg', '.cl-close-btn svg'].map((selector) =>
        document.querySelector(selector)?.getAttribute('stroke')
      );

    // Header text colour of each theme without button_color. The header icon
    // takes it too.
    const themeHeaderColors = [
      ['default', '#0f172a'],
      ['dark', 'white'],
      ['ocean', 'white'],
      ['aurora', 'white'],
      ['punku-ai-bookingkit', 'white'],
      ['swarovski', 'white'],
    ] as const;

    const avatar = () => document.querySelector('.cl-header-avatar') as HTMLElement;

    it.each([
      // 85% white on dark red still reads at 4.5:1: the site colour stays as on v1.0.24.
      ['#9e183b', '#ffffff', ''],
      // 85% white on a mid green does not: the subtitle shows at full opacity.
      ['#3F9B47', '#FFFFFF', '1'],
    ])('shows the subtitle on a %s header at full opacity only where 85%% fails', (button_color, button_text_color, opacity) => {
      renderHeader({ button_color, button_text_color });

      const subtitle = document.querySelector('.cl-header-subtitle') as HTMLElement;
      expect(subtitle.style.color).not.toBe('');
      expect(subtitle.style.opacity).toBe(opacity);
    });

    it('draws the session refresh arc in the accent for light surfaces', () => {
      renderHeader({ theme: 'ocean', isRefreshingSession: true });

      const styles = Array.from(document.querySelectorAll('style')).map((style) => style.textContent || '').join('\n');
      expect(styles).toMatch(/\.cl-refresh-spinner \{[^}]*border-top: 2px solid var\(--cl-accent-on-light, #0969da\);/);
    });

    it.each(themeHeaderColors)('uses the %s theme header colour without custom colours', (theme, color) => {
      renderHeader({ theme });

      expect(headerIconStrokes()).toEqual([color, color, color]);
      // Every theme icon reads on its header: no plate.
      expect(avatar()).not.toHaveClass('cl-header-avatar--plate');
      expect(avatar().getAttribute('style')).toBeNull();
    });

    it.each(themeHeaderColors)(
      'ignores button_text_color without button_color in the %s theme',
      (theme, color) => {
        renderHeader({ theme, button_text_color: '#FFEE00' });

        expect(headerIconStrokes()).toEqual([color, color, color]);
      }
    );

    it('keeps the default header icons dark when button_text_color is white', () => {
      renderHeader({ theme: 'default', button_text_color: '#FFFFFF' });

      const header = document.querySelector('.cl-header') as HTMLElement;
      expect(header.getAttribute('style')).toBeNull();
      expect(headerIconStrokes()).toEqual(['#0f172a', '#0f172a', '#0f172a']);
      expect(avatar()).not.toHaveClass('cl-header-avatar--plate');
    });

    it('puts the header icon on a plate only where it would vanish on the header', () => {
      // White on a white header: a grey plate carries the white icon (3:1).
      const { rerender } = renderHeader({ button_color: '#ffffff' });
      expect(avatar()).toHaveClass('cl-header-avatar--plate');
      expect(avatar().style.backgroundColor).toBe('rgb(140, 140, 140)');
      expect(headerIconStrokes()[0]).toBe('#FFFFFF');

      // Red on red: a lighter shade of the red carries the red icon.
      rerender(<ChatWindow {...defaultProps} onStartNewSession={jest.fn()} onClose={jest.fn()} button_color="#c81e1e" button_text_color="#c81e1e" />);
      expect(avatar()).toHaveClass('cl-header-avatar--plate');
      expect(avatar().style.backgroundColor).toBe('rgb(236, 176, 176)');

      // White on a dark red reads (8.4:1): no plate.
      rerender(<ChatWindow {...defaultProps} onStartNewSession={jest.fn()} onClose={jest.fn()} button_color="#9e183b" button_text_color="#ffffff" />);
      expect(avatar()).not.toHaveClass('cl-header-avatar--plate');
      expect(avatar().style.backgroundColor).toBe('');
    });

    it('never puts an uploaded header image on a plate', () => {
      renderHeader({ button_color: '#ffffff', header_icon: 'https://example.com/logo.png' });

      expect(document.querySelector('img.cl-header-logo-image')).toBeInTheDocument();
      expect(document.querySelector('.cl-header-avatar')).not.toBeInTheDocument();
    });

    it.each(themeHeaderColors.map(([theme]) => theme))(
      'uses button_text_color with button_color in the %s theme',
      (theme) => {
        renderHeader({ theme, button_color: '#123456', button_text_color: '#FFEE00' });

        expect(headerIconStrokes()).toEqual(['#FFEE00', '#FFEE00', '#FFEE00']);
      }
    );

    it('uses white icons with button_color and no button_text_color', () => {
      renderHeader({ theme: 'default', button_color: '#123456' });

      expect(headerIconStrokes()).toEqual(['#FFFFFF', '#FFFFFF', '#FFFFFF']);
    });

    it('keeps button_text_color for the send icon, which sits on the button colour', () => {
      renderHeader({ theme: 'default', button_text_color: '#FFEE00' });

      const sendIcon = document.querySelector('.cl-send-icon') as SVGElement;
      expect(sendIcon.getAttribute('style')).toContain('stroke: #FFEE00');
    });
  });

  describe('Header, composer and AI notice', () => {
    it('should label the header actions in the chat language', () => {
      const { rerender } = render(
        <ChatWindow {...defaultProps} onStartNewSession={jest.fn()} onClose={jest.fn()} />
      );
      expect(screen.getByRole('button', { name: 'New conversation' })).toHaveClass('cl-header-btn');
      // Desktop hides the close button by default, so check its label directly.
      expect(document.querySelector('.cl-close-btn')).toHaveAttribute('aria-label', 'Close chat');

      rerender(<ChatWindow {...defaultProps} language="de" onStartNewSession={jest.fn()} onClose={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'Neues Gespräch' })).toBeInTheDocument();
      expect(document.querySelector('.cl-close-btn')).toHaveAttribute('aria-label', 'Chat schließen');
    });

    it('should put the title and the status in one header row', () => {
      render(<ChatWindow {...defaultProps} window_title="Museum information" />);

      const content = document.querySelector('.cl-header-content') as HTMLElement;
      expect(content.querySelector('.cl-header-title')).toHaveTextContent('Museum information');
      expect(content.querySelector('.cl-header-subtitle')).toHaveTextContent('Powered by PUNKU.AI & bookingkit');
      expect(content.querySelector('.cl-header-actions')).toBeInTheDocument();
    });

    it('should mark a header that a site colours', () => {
      const { rerender } = render(<ChatWindow {...defaultProps} />);
      expect(document.querySelector('.cl-header')).not.toHaveClass('cl-header--colored');

      rerender(<ChatWindow {...defaultProps} button_color="#7c2d12" />);
      expect(document.querySelector('.cl-header')).toHaveClass('cl-header--colored');
    });

    it.each([
      ['en', 'You are chatting with an AI assistant.'],
      ['de', 'Sie chatten mit einem KI-Assistenten.'],
    ] as const)('should show the AI notice in %s by default', (language, notice) => {
      render(<ChatWindow {...defaultProps} language={language} />);

      expect(document.querySelector('.cl-ai-notice')).toHaveTextContent(notice);
    });

    it('should show the site text as the AI notice', () => {
      render(<ChatWindow {...defaultProps} ai_notice_text="Our assistant is an AI. Please check important details." />);

      expect(document.querySelector('.cl-ai-notice')).toHaveTextContent('Our assistant is an AI. Please check important details.');
    });

    it('should hide the AI notice with show_ai_notice false', () => {
      render(<ChatWindow {...defaultProps} show_ai_notice={false} />);

      expect(document.querySelector('.cl-ai-notice')).not.toBeInTheDocument();
    });

    it('should name the send button and enable it only when there is text', () => {
      render(<ChatWindow {...defaultProps} />);

      const sendButton = screen.getByRole('button', { name: 'Send message' });
      expect(sendButton).toHaveAttribute('type', 'button');
      expect(sendButton).toBeDisabled();

      fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
      expect(sendButton).toBeDisabled();

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
      expect(sendButton).not.toBeDisabled();
    });

    it('should mark the message list busy while an answer is on its way', async () => {
      mockedSendMessage.mockImplementationOnce(() => new Promise(() => {}));
      render(<ChatWindow {...defaultProps} enable_streaming={false} />);

      const list = document.querySelector('.cl-messages_container') as HTMLElement;
      expect(list).toHaveAttribute('aria-busy', 'false');

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => expect(list).toHaveAttribute('aria-busy', 'true'));
    });

    it('should clear the typed text when a new conversation starts', () => {
      const onStartNewSession = jest.fn();
      render(<ChatWindow {...defaultProps} onStartNewSession={onStartNewSession} />);

      const input = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'A draft for the old conversation' } });
      fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
      fireEvent.click(screen.getByText('Confirm'));

      expect(onStartNewSession).toHaveBeenCalledTimes(1);
      expect(input.value).toBe('');
    });

    it('should keep the typed text when the new conversation is cancelled', () => {
      render(<ChatWindow {...defaultProps} onStartNewSession={jest.fn()} />);

      const input = screen.getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: 'Keep me' } });
      fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
      fireEvent.click(screen.getByText('Cancel'));

      expect(input.value).toBe('Keep me');
    });

    it('should keep the input_container_style background when button_color is set', () => {
      render(
        <ChatWindow
          {...defaultProps}
          button_color="#7c2d12"
          input_container_style={{ backgroundColor: '#fafaf9' }}
        />
      );

      expect(document.querySelector('.cl-input_container')).toHaveStyle({ backgroundColor: 'rgb(250, 250, 249)' });
    });

    it('should give the field the input_style background, because the textarea is transparent', () => {
      render(<ChatWindow {...defaultProps} input_style={{ backgroundColor: '#fef3c7' }} />);

      expect(document.querySelector('.cl-composer-field')).toHaveStyle({ backgroundColor: 'rgb(254, 243, 199)' });
    });

    it('should size the field, not the bar, with the height keys of input_container_style', () => {
      render(
        <ChatWindow
          {...defaultProps}
          input_container_style={{ height: '56px', minHeight: '48px', maxHeight: '80px', borderTop: '2px solid #e7e5e4' }}
        />
      );

      const bar = document.querySelector<HTMLElement>('.cl-input_container')!;
      const field = document.querySelector<HTMLElement>('.cl-composer-field')!;
      expect(field.style.height).toBe('56px');
      expect(field.style.minHeight).toBe('48px');
      expect(field.style.maxHeight).toBe('80px');
      expect(bar.style.height).toBe('');
      expect(bar.style.minHeight).toBe('');
      expect(bar.style.maxHeight).toBe('');
      expect(bar).toHaveStyle({ borderTop: '2px solid #e7e5e4' });
    });
  });

  describe('Online/Offline Status', () => {
    it('should show online message when online', () => {
      render(<ChatWindow {...defaultProps} online={true} />);

      const onlineIndicator = document.querySelector('.cl-online-message');
      expect(onlineIndicator).toBeInTheDocument();
    });

    it('should show offline message when offline', () => {
      render(<ChatWindow {...defaultProps} online={false} />);

      const offlineIndicator = document.querySelector('.cl-offline-message');
      expect(offlineIndicator).toBeInTheDocument();
    });

    it('should show custom online message', () => {
      render(<ChatWindow {...defaultProps} online={true} online_message="We are online!" />);

      expect(screen.getByText("We are online!")).toBeInTheDocument();
    });

    it('should show linked PUNKU and bookingkit branding by default', () => {
      render(<ChatWindow {...defaultProps} online={true} />);

      const punkuLink = screen.getByRole('link', { name: 'PUNKU.AI' });
      const bookingkitLink = screen.getByRole('link', { name: 'bookingkit' });

      expect(punkuLink).toHaveAttribute(
        'href',
        'https://www.punku.ai/?utm_source=customer_widget&utm_medium=referral&utm_campaign=powered_by'
      );
      expect(punkuLink).toHaveAttribute('target', '_blank');
      expect(punkuLink).toHaveAttribute('rel', 'noopener noreferrer nofollow');
      expect(bookingkitLink).toHaveAttribute('href', 'https://bookingkit.com/');
      expect(bookingkitLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should show linked PUNKU-only branding when configured', () => {
      render(<ChatWindow {...defaultProps} online={true} branding="punku-ai" />);

      const punkuLink = screen.getByRole('link', { name: 'PUNKU.AI' });

      expect(punkuLink).toHaveAttribute(
        'href',
        'https://www.punku.ai/?utm_source=customer_widget&utm_medium=referral&utm_campaign=powered_by'
      );
      expect(punkuLink).toHaveAttribute('target', '_blank');
      expect(punkuLink).toHaveAttribute('rel', 'noopener noreferrer nofollow');
      expect(screen.queryByRole('link', { name: 'bookingkit' })).not.toBeInTheDocument();
    });

    it('should show custom offline message', () => {
      render(<ChatWindow {...defaultProps} online={false} offline_message="We are offline" />);

      expect(screen.getByText('We are offline')).toBeInTheDocument();
    });
  });

  describe('Close Button', () => {
    it('should render close button when onClose is provided', () => {
      const onClose = jest.fn();

      render(<ChatWindow {...defaultProps} onClose={onClose} />);

      const closeBtn = document.querySelector('.cl-close-btn');
      expect(closeBtn).toBeInTheDocument();
    });

    it('should keep close button hidden by default for desktop screens', () => {
      const onClose = jest.fn();

      render(<ChatWindow {...defaultProps} onClose={onClose} />);

      const closeBtn = document.querySelector('.cl-close-btn');
      expect(closeBtn).toHaveStyle({ display: 'none' });
    });

    it('should show close button on desktop when configured', () => {
      const onClose = jest.fn();

      render(<ChatWindow {...defaultProps} onClose={onClose} show_close_button_on_desktop={true} />);

      const closeBtn = document.querySelector('.cl-close-btn');
      expect(closeBtn).toHaveStyle({ display: 'flex' });
    });

    it('should not render close button when onClose is not provided', () => {
      render(<ChatWindow {...defaultProps} />);

      const closeBtn = document.querySelector('.cl-close-btn');
      expect(closeBtn).not.toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', () => {
      const onClose = jest.fn();

      render(<ChatWindow {...defaultProps} onClose={onClose} />);

      const closeBtn = document.querySelector('.cl-close-btn') as HTMLButtonElement;
      fireEvent.click(closeBtn);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Placeholder Display', () => {
    it('should show placeholder when sending message (non-streaming)', async () => {
      mockedSendMessage.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ChatWindow {...defaultProps} enable_streaming={false} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByTestId('chat-placeholder')).toBeInTheDocument();
      });
    });
  });

  describe('Language Support', () => {
    it('should use English translations by default', () => {
      render(<ChatWindow {...defaultProps} messages={[]} />);

      // Default English welcome message should be shown (through mocked ChatMessage)
      expect(screen.getByTestId('bot-message')).toBeInTheDocument();
    });

    it('should accept language prop', () => {
      render(<ChatWindow {...defaultProps} language="de" />);

      // Component should render without errors with German language
      expect(document.querySelector('.cl-window')).toBeInTheDocument();
    });
  });

  describe('Dimensions', () => {
    it('should apply custom width', () => {
      render(<ChatWindow {...defaultProps} width={500} />);

      const window = document.querySelector('.cl-window');
      expect(window).toHaveStyle({ width: '500px' });
    });

    it('should apply custom height', () => {
      render(<ChatWindow {...defaultProps} height={700} />);

      const window = document.querySelector('.cl-window');
      expect(window).toHaveStyle({ height: '700px' });
    });
  });

  describe('Phone window style (mobile_chat_window_style)', () => {
    const phoneQuery = '@media (max-width: 640px) {';
    // The phone styles of a live embed (no flow ID, host or texts).
    const liveStyles = {
      chat_window_style: { maxHeight: '550px' },
      mobile_chat_window_style: { bottom: '65px', height: 'calc(98vh - 120px)' },
    };
    // jsdom has no layout. The window stylesheet is the result.
    const renderedStyles = () => Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent || '')
      .join('\n');
    // The phone rule, and the rest of the stylesheet without it.
    const splitPhoneRule = (styles: string) => {
      const start = styles.indexOf(phoneQuery);
      let depth = 0;
      let end = start;
      for (; end < styles.length; end += 1) {
        if (styles[end] === '{') depth += 1;
        if (styles[end] === '}' && --depth === 0) break;
      }
      return { phone: styles.slice(start, end + 1), rest: styles.slice(0, start) + styles.slice(end + 1) };
    };
    const chatWindowRule = (rule: string) => rule.slice(rule.indexOf('.cl-chat-window {'), rule.indexOf('}', rule.indexOf('.cl-chat-window {')));

    it('keeps the phone defaults without the prop', () => {
      render(<ChatWindow {...defaultProps} />);

      const box = chatWindowRule(splitPhoneRule(renderedStyles()).phone);
      expect(box).toContain('top: calc(var(--cl-visual-viewport-top, 0px) + var(--cl-top-offset, 0px)) !important;');
      expect(box).toContain('bottom: auto !important;');
      // 80 px for the trigger over the home indicator, none while the keyboard is open.
      expect(box).toContain('height: calc(var(--cl-visual-viewport-height, 100%) - var(--cl-trigger-room, calc(80px + var(--cl-safe-area-bottom, 0px))) - var(--cl-top-offset, 0px)) !important;');
    });

    it('places the phone window from the visible bottom with the live styles', () => {
      render(<ChatWindow {...defaultProps} {...liveStyles} />);

      const box = chatWindowRule(splitPhoneRule(renderedStyles()).phone);
      expect(box).toContain('top: auto !important;');
      expect(box).toContain(`bottom: ${visualViewportInset('bottom', 'round(max(0px, 65px), 1px)')} !important;`);
      expect(box).toContain('height: round(calc(calc(98 * var(--cl-visual-viewport-height, 100vh) / 100) - 120px), 1px) !important;');
      // The phone rule keeps its other declarations.
      expect(box).toContain('padding-top: var(--cl-safe-area-top, 0px) !important;');
      expect(box).toContain('transition-property: opacity, transform, visibility;');
    });

    it('keeps the side margins of the swarovski-widget branch in the swarovski theme only', () => {
      const margin = `left: ${visualViewportInset('left', 'round(max(0px, 8px), 1px)')} !important;`;
      const { unmount } = render(<ChatWindow {...defaultProps} theme="default" {...liveStyles} />);
      const defaultBox = chatWindowRule(splitPhoneRule(renderedStyles()).phone);
      expect(defaultBox).toContain('width: var(--cl-visual-viewport-width, 100%) !important;');
      expect(defaultBox).not.toContain(margin);
      unmount();

      render(<ChatWindow {...defaultProps} theme="swarovski" {...liveStyles} />);
      const box = chatWindowRule(splitPhoneRule(renderedStyles()).phone);
      expect(box).toContain(margin);
      expect(box).toContain('90 * var(--cl-visual-viewport-width, 100vw) / 100');
      // The top and bottom gaps of the prop stay.
      expect(box).toContain(`bottom: ${visualViewportInset('bottom', 'round(max(0px, 65px), 1px)')} !important;`);
    });

    it('changes only the phone rule', () => {
      const { unmount } = render(<ChatWindow {...defaultProps} chat_window_style={liveStyles.chat_window_style} />);
      const without = splitPhoneRule(renderedStyles());
      unmount();
      render(<ChatWindow {...defaultProps} {...liveStyles} />);
      const withProp = splitPhoneRule(renderedStyles());

      expect(withProp.rest).toBe(without.rest);
      expect(withProp.phone).not.toBe(without.phone);
    });

    it('leaves chat_window_style on the window, where the phone rule fills the box', () => {
      render(<ChatWindow {...defaultProps} {...liveStyles} />);

      // eslint-disable-next-line testing-library/no-node-access
      const chatWindow = document.querySelector<HTMLElement>('.cl-window')!;
      expect(chatWindow.style.maxHeight).toBe('550px');
      // The phone rule wins over the inline maxHeight, as on the swarovski-widget branch.
      const phone = splitPhoneRule(renderedStyles()).phone;
      expect(phone).toMatch(/\.cl-window \{\s*width: 100% !important;\s*height: 100% !important;\s*max-height: 100% !important;/);
    });

    it('changes nothing on a scaled page in landscape, where the phone rule is off', () => {
      const landscape = { scale: 2.3125, width: 740, height: 361 };
      const { unmount } = render(<ChatWindow {...defaultProps} scaledPage={landscape} />);
      const without = renderedStyles();
      unmount();
      render(<ChatWindow {...defaultProps} scaledPage={landscape} mobile_chat_window_style={liveStyles.mobile_chat_window_style} />);

      expect(renderedStyles()).toBe(without);
    });

    it('measures the frame on a scaled page in portrait', () => {
      render(
        <ChatWindow
          {...defaultProps}
          scaledPage={{ scale: 1.21875, width: 390, height: 843 }}
          mobile_chat_window_style={liveStyles.mobile_chat_window_style}
        />
      );

      const styles = renderedStyles();
      expect(styles).not.toContain('@media (max-width: 640px)');
      expect(styles).toContain('height: round(calc(calc(98 * var(--cl-visual-viewport-height, 843px) / 100) - 120px), 1px) !important;');
      expect(styles).toContain(`bottom: ${visualViewportInset('bottom', 'round(max(0px, 79.22px), 1px)')} !important;`);
    });
  });

  describe('Visible screen (#77)', () => {
    // jsdom has no visual viewport. Install a fake 412 x 839 phone screen.
    class FakeVisualViewport extends EventTarget {
      offsetLeft = 43;
      offsetTop = 88;
      width = 412;
      height = 839;
      scale = 1;
    }

    const jsdomVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    let viewport: FakeVisualViewport;
    const box = () => {
      // The fixed window box has no accessible role. Its CSS variables are the result.
      // eslint-disable-next-line testing-library/no-node-access
      const chatWindow = document.querySelector<HTMLElement>('.cl-chat-window')!;
      return ['left', 'top', 'width', 'height'].map((side) =>
        chatWindow.style.getPropertyValue(`--cl-visual-viewport-${side}`)
      );
    };

    beforeEach(() => {
      viewport = new FakeVisualViewport();
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    });

    afterEach(() => {
      if (jsdomVisualViewport) Object.defineProperty(window, 'visualViewport', jsdomVisualViewport);
      else delete (window as { visualViewport?: unknown }).visualViewport;
    });

    it('gives the open window the visible box and follows it', () => {
      render(<ChatWindow {...defaultProps} open={true} />);
      expect(box()).toEqual(['43px', '88px', '412px', '839px']);

      viewport.height = 500;
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
      });

      expect(box()).toEqual(['43px', '88px', '412px', '500px']);
    });

    it('tracks the visible box only while the window is open', () => {
      const { rerender } = render(<ChatWindow {...defaultProps} open={false} />);
      expect(box()).toEqual(['', '', '', '']);

      rerender(<ChatWindow {...defaultProps} open={true} />);
      expect(box()).toEqual(['43px', '88px', '412px', '839px']);

      rerender(<ChatWindow {...defaultProps} open={false} />);
      viewport.width = 300;
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
      });
      expect(box()).toEqual(['43px', '88px', '412px', '839px']);
    });
  });

  describe('Phone keyboard', () => {
    const renderedStyles = () => Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent || '')
      .join('\n');
    const rule = (styles: string, selector: string) => {
      const start = styles.indexOf(`${selector} {`);
      return start < 0 ? '' : styles.slice(start, styles.indexOf('}', start) + 1);
    };

    it('lets the phone window end at the keyboard, over the trigger', () => {
      render(<ChatWindow {...defaultProps} />);
      const phone = renderedStyles().slice(renderedStyles().indexOf('@media (max-width: 640px) {'));
      expect(rule(phone, '.cl-chat-window[data-cl-keyboard]')).toContain('--cl-trigger-room: 0px;');
    });

    it('hides the header on a short landscape screen while the keyboard is open', () => {
      render(<ChatWindow {...defaultProps} />);
      const styles = renderedStyles();
      const landscape = styles.slice(styles.indexOf('@media (min-width: 641px) and (max-width: 1023px) and (max-height: 500px)'));
      expect(rule(landscape, '.cl-chat-window[data-cl-keyboard] .cl-header')).toContain('display: none !important;');
    });

    it('keeps a touch drag on the header from scrolling the page behind', () => {
      render(<ChatWindow {...defaultProps} window_title="Museum information" />);
      const title = screen.getByText('Museum information');
      const touch = (type: string, y: number) => {
        const event = new Event(type, { bubbles: true, composed: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: [{ clientX: 100, clientY: y }] });
        title.dispatchEvent(event);
        return event;
      };
      touch('touchstart', 200);
      expect(touch('touchmove', 120).defaultPrevented).toBe(true);
    });
  });
});
