import React from 'react';
import { ClosedWidgetHintStorage } from '../utils/closedWidgetHintStorage';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// Mock the child components before importing ChatWidget
jest.mock('./chatTrigger', () => {
  return function MockChatTrigger({
    open,
    setOpen,
    triggerRef,
    lang,
    tabIndex
  }: {
    open: boolean;
    setOpen: (open: boolean) => void;
    triggerRef: React.RefObject<HTMLButtonElement>;
    lang?: string;
    tabIndex?: number;
  }) {
    return (
      <button
        ref={triggerRef}
        data-testid="chat-trigger"
        lang={lang}
        tabIndex={tabIndex}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Close' : 'Open'}
      </button>
    );
  };
});

jest.mock('./chatWindow', () => {
  const mockReact = require('react');

  return function MockChatWindow({
    open,
    messages,
    addMessage,
    onStartNewSession,
    onClose,
    language,
    show_close_button_on_desktop,
    positionOverrideStyle,
    programmaticMessage,
    onProgrammaticMessageHandled,
    hostUrl,
    mobile_chat_window_style,
    dismissDialogRef,
    openerRef,
    openedByVisitorRef,
    triggerRef,
    coversTrigger
  }: {
    open: boolean;
    messages: any[];
    addMessage: (msg: any) => void;
    onStartNewSession?: () => void;
    onClose?: () => void;
    language?: string;
    show_close_button_on_desktop?: boolean;
    positionOverrideStyle?: React.CSSProperties;
    programmaticMessage?: { id: number; message: string } | null;
    onProgrammaticMessageHandled?: (id: number) => void;
    hostUrl?: string;
    mobile_chat_window_style?: React.CSSProperties;
    dismissDialogRef?: React.MutableRefObject<(() => boolean) | null>;
    openerRef?: React.RefObject<HTMLElement | null>;
    openedByVisitorRef?: React.RefObject<boolean>;
    triggerRef?: React.RefObject<HTMLButtonElement>;
    coversTrigger?: boolean;
  }) {
    mockReact.useEffect(() => {
      if (!open || !programmaticMessage) return;

      addMessage({ message: programmaticMessage.message, isSend: true });
      onProgrammaticMessageHandled?.(programmaticMessage.id);
    }, [addMessage, onProgrammaticMessageHandled, open, programmaticMessage]);

    // The tests read the opener that the widget hands over, and whether a visitor opened it.
    (globalThis as any).mockOpenerRef = openerRef;
    (globalThis as any).mockOpenedByVisitorRef = openedByVisitorRef;

    // A dialog in the window, as the new-conversation dialog: Escape closes it first.
    const [dialogOpen, setDialogOpen] = mockReact.useState(false);
    mockReact.useLayoutEffect(() => {
      if (!dismissDialogRef || !dialogOpen) return undefined;
      dismissDialogRef.current = () => {
        setDialogOpen(false);
        return true;
      };
      return () => {
        dismissDialogRef.current = null;
      };
    }, [dismissDialogRef, dialogOpen]);

    // ChatWindow gives the focus back to the launcher in an effect of the
    // render that closes it. The tests read the launcher's tab index then.
    mockReact.useEffect(() => {
      if (!open) (globalThis as any).mockTriggerTabIndexOnClose = triggerRef?.current?.tabIndex;
    }, [open, triggerRef]);

    if (!open) return null;
    return (
      <div data-testid="chat-window" style={positionOverrideStyle}>
        <span data-testid="message-count">{messages?.length || 0}</span>
        <span data-testid="language">{language || 'en'}</span>
        <span data-testid="host-url">{hostUrl}</span>
        <span data-testid="show-close-button-on-desktop">{String(Boolean(show_close_button_on_desktop))}</span>
        <span data-testid="covers-trigger">{String(Boolean(coversTrigger))}</span>
        <span data-testid="mobile-chat-window-style">{JSON.stringify(mobile_chat_window_style ?? null)}</span>
        <button data-testid="add-message" onClick={() => addMessage({ message: 'Test', isSend: true })}>
          Add Message
        </button>
        {onStartNewSession && (
          <button data-testid="new-session" onClick={onStartNewSession}>
            New Session
          </button>
        )}
        {onClose && (
          <button data-testid="close" onClick={onClose}>
            Close
          </button>
        )}
        <button data-testid="open-dialog" onClick={() => setDialogOpen(true)}>
          Open dialog
        </button>
        {dialogOpen && <div data-testid="window-dialog" />}
        <span data-testid="opener">{openerRef?.current?.textContent ?? ''}</span>
      </div>
    );
  };
});

// Mock SessionStorage
jest.mock('../utils/sessionStorage', () => ({
  SessionStorage: {
    getOrCreateSession: jest.fn(() => ({
      sessionId: 'mock-session-id',
      messages: [],
      isNewSession: true
    })),
    getStoredSession: jest.fn(() => ({
      sessionId: 'mock-session-id',
      messages: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      domain: 'localhost',
      flowId: 'test-flow-id'
    })),
    isSessionExpired: jest.fn(() => false),
    updateMessages: jest.fn(() => true),
    clearSession: jest.fn()
  }
}));

// Mock detectBrowserLanguage
jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  detectBrowserLanguage: jest.fn(() => 'en')
}));

// Import after mocks
import ChatWidget, { DEFAULT_Z_INDEX, getVisibleCornerShift, MAX_Z_INDEX, readCornerOffsets } from './index';
import { safeAreaGap } from './utils';
import { PAGE_DIALOG_CHECK_MS } from './pageDialogs';
import { noteVisitorInput } from './visitorAction';
import { THEME_COLORS } from './controlColors';
import { SessionStorage } from '../utils/sessionStorage';

describe('ChatWidget', () => {
  const defaultClosedHintText = "Hi, I am your AI assistant. How can I help you?";
  const defaultProps = {
    host_url: 'http://localhost:3000',
    flow_id: 'test-flow-id',
    input_value: 'test',
    input_type: 'chat',
    output_type: 'chat'
  };

  const setViewportSize = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: width
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: height
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    setViewportSize(1024, 768);
    // JSDOM has no layout. Give the trigger and its anchor measurable bounds.
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 400, y: 400, left: 400, top: 400, right: 448, bottom: 448,
      width: 48, height: 48, toJSON: () => ({})
    });
    // Reset window global
    delete (window as any)['punku-chat-widget_api'];
    delete (window as any)['custom-widget_api'];
    delete (window as any).punku;

    // Reset mock implementation
    (SessionStorage.getOrCreateSession as jest.Mock).mockReturnValue({
      sessionId: 'mock-session-id',
      messages: [],
      isNewSession: true
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render the chat trigger', () => {
      render(<ChatWidget {...defaultProps} />);

      expect(screen.getByTestId('chat-trigger')).toBeInTheDocument();
    });

    it('should define widget-level base text sizing inside the shadow stylesheet', () => {
      const { container } = render(<ChatWidget {...defaultProps} />);

      expect(container.querySelector('.cl-widget-root')).toBeInTheDocument();

      const styleElement = container.querySelector('style');
      expect(styleElement?.textContent).toContain(':host');
      expect(styleElement?.textContent).toContain('font-size: 16px');
      expect(styleElement?.textContent).toContain('.cl-widget-root');
    });

    it('should keep the window title, an h2, free of the browser heading margins', () => {
      const { container } = render(<ChatWidget {...defaultProps} />);

      const css = container.querySelector('style')?.textContent ?? '';
      expect(css).toMatch(/\.cl-window \.cl-header-title \{\s*margin: 0;/);
    });

    it('should always show feedback buttons on a device with a touch screen, also next to a trackpad', () => {
      // Browsers cannot emulate a touch screen next to a mouse, so check the rule.
      const { container } = render(<ChatWidget {...defaultProps} />);

      const css = container.querySelector('style')?.textContent ?? '';
      expect(css).toMatch(
        /@media \(hover: none\), \(any-pointer: coarse\) \{\s*\.cl-window \.cl-chat-message \.feedback-container \{\s*opacity: 1;/
      );
    });

    it('should give the swarovski theme the link and button colours that the contrast guard checks', () => {
      const { container } = render(<ChatWidget {...defaultProps} />);

      const css = container.querySelector('style')?.textContent ?? '';
      const rule = css.match(/\.cl-window\.theme-swarovski \{([^}]*)\}/);
      expect(rule?.[1]).toContain(`--cl-link: ${THEME_COLORS.swarovski.link};`);
      expect(rule?.[1]).toContain(`--cl-accent: ${THEME_COLORS.swarovski.accent};`);
      // Dark focus instead of the blue ring.
      expect(css).toMatch(/\.cl-window\.theme-swarovski \.cl-composer-field:focus-within \{\s*border-color: #1a1a1a;/);
    });

    it('should floor every rem length at its designed px size, so a small host root cannot shrink it', () => {
      const { container } = render(<ChatWidget {...defaultProps} />);

      const css = container.querySelector('style')?.textContent ?? '';
      // rem follows the host page root font-size. A bare rem would shrink on a 10px root.
      const remLengths = css.match(/(?<![\w.-])\d*\.?\d+\s*rem\b/gi) ?? [];
      const flooredPattern = /max\((\d+)px, (\d*\.?\d+)rem\)/g;
      let floored = 0;
      let match: RegExpExecArray | null;
      while ((match = flooredPattern.exec(css)) !== null) {
        floored += 1;
        expect(Number(match[1])).toBe(Number(match[2]) * 16);
      }
      expect(floored).toBeGreaterThan(0);
      expect(remLengths).toHaveLength(floored);
      expect(css).toMatch(/\.cl-trigger \{[^}]*height: max\(48px, 3rem\);[^}]*width: max\(48px, 3rem\);/);
    });

    it('should not show chat window by default', () => {
      render(<ChatWidget {...defaultProps} />);

      expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
    });

    it('should show chat window when start_open is true', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      expect(screen.getByTestId('chat-window')).toBeInTheDocument();
    });

    it('should default host_url to app.punku.ai when omitted', () => {
      render(
        <ChatWidget
          flow_id="test-flow-id"
          input_value="test"
          input_type="chat"
          output_type="chat"
          start_open={true}
        />
      );

      expect(screen.getByTestId('host-url')).toHaveTextContent('https://app.punku.ai');
    });

    it('should pass desktop close button setting to chat window', () => {
      render(<ChatWidget {...defaultProps} start_open={true} show_close_button_on_desktop={true} />);

      expect(screen.getByTestId('show-close-button-on-desktop')).toHaveTextContent('true');
    });

    it('should pass the phone window style to the chat window', () => {
      const style = { bottom: '65px', height: 'calc(98vh - 120px)' };
      render(<ChatWidget {...defaultProps} start_open={true} mobile_chat_window_style={style} />);

      expect(screen.getByTestId('mobile-chat-window-style')).toHaveTextContent(JSON.stringify(style));
    });

    it('should apply custom left offset for left-side launcher placement', () => {
      render(<ChatWidget {...defaultProps} chat_position="bottom-left" left_offset={48} />);

      const widgetRoot = document.querySelector('.cl-widget-root');
      expect((widgetRoot as HTMLElement).style).toMatchObject({
        left: safeAreaGap('left', '48px'),
        right: '',
      });
    });

    it('should apply custom right offset for right-side launcher placement', () => {
      render(<ChatWidget {...defaultProps} chat_position="bottom-right" right_offset={36} />);

      const widgetRoot = document.querySelector('.cl-widget-root');
      expect((widgetRoot as HTMLElement).style).toMatchObject({
        right: safeAreaGap('right', '36px'),
        left: '',
      });
    });

    it('should not show closed widget hint by default when widget is closed', () => {
      render(<ChatWidget {...defaultProps} />);

      expect(screen.queryByText(defaultClosedHintText)).not.toBeInTheDocument();
    });

    it('should use custom closed widget hint text', () => {
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_text="Need assistance?" />);

      expect(screen.getByText('Need assistance?')).toBeInTheDocument();
    });

    it('should show the default hint text in the chat language', () => {
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} default_language="de" />);

      expect(screen.getByText('Hallo, ich bin Ihr KI-Assistent. Wie kann ich Ihnen helfen?')).toBeInTheDocument();
      expect(screen.queryByText(defaultClosedHintText)).not.toBeInTheDocument();
    });

    it('should keep the default hint, in the new language, when the page language changes', async () => {
      document.documentElement.setAttribute('lang', 'en');
      try {
        render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} />);
        expect(screen.getByText(defaultClosedHintText)).toBeVisible();

        act(() => {
          document.documentElement.setAttribute('lang', 'de');
        });

        // The same hint in the new language, not a new hint that was shown before.
        await waitFor(() => expect(screen.getByText('Hallo, ich bin Ihr KI-Assistent. Wie kann ich Ihnen helfen?')).toBeVisible());
      } finally {
        document.documentElement.removeAttribute('lang');
      }
    });

    it('should show no hint for an empty hint text', () => {
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_text="" />);

      expect(document.querySelector('.cl-closed-widget-hint')).not.toBeInTheDocument();
    });

    it('should support multiline closed widget hint text', () => {
      const hintText = "Hi, I am your AI assistant.\nHow can I help you?";
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_text={hintText} />);

      const hint = screen.getByText((content, element) => {
        return Boolean(element && element.classList.contains('cl-closed-widget-hint-text') && content.includes('How can I help you?'));
      });
      expect(hint.textContent).toBe(hintText);
    });

    it('should position closed widget hint on the left by default', () => {
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-left');
    });

    it('should keep the default left hint placement for bottom-right widgets', () => {
      render(<ChatWidget {...defaultProps} chat_position="bottom-right" show_closed_widget_hint={true} closed_widget_hint_position="left" />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-left');
    });

    it('should position closed widget hint to the right for bottom-left widgets', () => {
      render(<ChatWidget {...defaultProps} chat_position="bottom-left" show_closed_widget_hint={true} closed_widget_hint_position="left" />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-right');
      expect(hint).not.toHaveClass('cl-hint-left');
    });

    it('should position closed widget hint at top when configured', () => {
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_position="top" />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-top');
    });

    it('should align top closed widget hint from the left for left-side widgets', () => {
      render(<ChatWidget {...defaultProps} chat_position="bottom-left" show_closed_widget_hint={true} closed_widget_hint_position="top" />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-top-left');
      expect(hint).not.toHaveClass('cl-hint-top');
    });

    it('should move top closed widget hint to bottom for top-right widgets', () => {
      render(<ChatWidget {...defaultProps} chat_position="top-right" show_closed_widget_hint={true} closed_widget_hint_position="top" />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-bottom');
      expect(hint).not.toHaveClass('cl-hint-top');
    });

    it('should move top closed widget hint to bottom-left for top-left widgets', () => {
      render(<ChatWidget {...defaultProps} chat_position="top-left" show_closed_widget_hint={true} closed_widget_hint_position="top" />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-bottom-left');
      expect(hint).not.toHaveClass('cl-hint-top-left');
    });

    it('should position closed widget hint at bottom when configured', () => {
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_position="bottom" />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-bottom');
    });

    it('should align bottom closed widget hint from the left for left-side widgets', () => {
      render(<ChatWidget {...defaultProps} chat_position="bottom-left" show_closed_widget_hint={true} closed_widget_hint_position="bottom" />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-bottom-left');
      expect(hint).not.toHaveClass('cl-hint-bottom');
    });

    it('should apply custom closed widget hint background color', () => {
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_background_color="#123456" />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveStyle({ backgroundColor: '#123456' });
    });

    it('should apply custom closed widget hint text color', () => {
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_text_color="#abcdef" />);

      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveStyle({ color: '#abcdef' });
    });
  });

  describe('Open/Close Behavior', () => {
    it('should open chat window when trigger is clicked', () => {
      render(<ChatWidget {...defaultProps} />);

      const trigger = screen.getByTestId('chat-trigger');
      fireEvent.click(trigger);

      expect(screen.getByTestId('chat-window')).toBeInTheDocument();
    });

    it('should close chat window when trigger is clicked again', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      const trigger = screen.getByTestId('chat-trigger');
      expect(screen.getByTestId('chat-window')).toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
    });

    it('should close chat window when close button is clicked', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      const closeButton = screen.getByTestId('close');
      fireEvent.click(closeButton);

      expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
    });

    it('should close chat window when clicking outside the widget', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      expect(screen.getByTestId('chat-window')).toBeInTheDocument();

      fireEvent.pointerDown(document.body);

      expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
    });

    it('should keep chat window open when clicking inside the widget', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      fireEvent.pointerDown(screen.getByTestId('chat-window'));

      expect(screen.getByTestId('chat-window')).toBeInTheDocument();
    });

    it.each(['data-punku-chat-toggle', 'data-punku-handler'])(
      'should let a page toggle button marked %s close the open widget',
      (attribute) => {
        render(<ChatWidget {...defaultProps} start_open={true} />);

        // The page's own button toggles the widget through the global API (Swarovski).
        const toggle = document.createElement('button');
        toggle.setAttribute(attribute, 'true');
        const icon = document.createElement('span');
        toggle.appendChild(icon);
        toggle.addEventListener('click', () => {
          const api = (window as any)['punku-chat-widget_api'];
          if (api.isOpen()) {
            api.close();
          } else {
            api.open();
          }
        });
        document.body.appendChild(toggle);

        try {
          fireEvent.pointerDown(icon);
          expect(screen.getByTestId('chat-window')).toBeInTheDocument();

          fireEvent.click(icon);
          expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
        } finally {
          toggle.remove();
        }
      },
    );

    it('should close chat window when Escape is pressed', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
    });

    it('should close an open dialog in the window first, then the chat, on Escape', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);
      fireEvent.click(screen.getByTestId('open-dialog'));
      expect(screen.getByTestId('window-dialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByTestId('window-dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('chat-window')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
    });

    it('should give the window the host page control that opened the chat, for the focus on close', () => {
      const pageButton = document.createElement('button');
      pageButton.textContent = 'Ask our assistant';
      document.body.appendChild(pageButton);
      try {
        render(<ChatWidget {...defaultProps} />);
        pageButton.focus();

        act(() => {
          (window as any)['punku-chat-widget_api'].open();
        });
        expect(screen.getByTestId('opener').textContent).toBe('Ask our assistant');

        fireEvent.keyDown(document, { key: 'Escape' });
        // The launcher opens it now: it takes the focus back itself.
        fireEvent.click(screen.getByTestId('chat-trigger'));
        expect(screen.getByTestId('opener').textContent).toBe('');
      } finally {
        pageButton.remove();
      }
    });

    it('should take the control inside a page component as the opener', () => {
      const component = document.createElement('div');
      const inner = document.createElement('button');
      inner.textContent = 'Chat';
      component.attachShadow({ mode: 'open' }).append(inner);
      document.body.appendChild(component);
      try {
        render(<ChatWidget {...defaultProps} />);
        inner.focus();
        expect(document.activeElement).toBe(component);

        act(() => {
          (window as any)['punku-chat-widget_api'].open();
        });

        expect((globalThis as any).mockOpenerRef.current).toBe(inner);
      } finally {
        component.remove();
      }
    });

    it('should forget the page opener when the launcher closes the chat', () => {
      const pageButton = document.createElement('button');
      pageButton.textContent = 'Ask our assistant';
      document.body.appendChild(pageButton);
      try {
        render(<ChatWidget {...defaultProps} />);
        pageButton.focus();
        act(() => {
          (window as any)['punku-chat-widget_api'].open();
        });
        expect((globalThis as any).mockOpenerRef.current).toBe(pageButton);

        // The visitor used the launcher: the focus goes back to it, not to the page.
        fireEvent.click(screen.getByTestId('chat-trigger'));

        expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
        expect((globalThis as any).mockOpenerRef.current).toBeNull();
      } finally {
        pageButton.remove();
      }
    });

    describe('focus on open only after a visitor action (WCAG 3.2.1)', () => {
      const openedByVisitor = () => (globalThis as any).mockOpenedByVisitorRef?.current;
      const api = () => (window as any)['punku-chat-widget_api'];

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should not count start_open as a visitor action', () => {
        render(<ChatWidget {...defaultProps} start_open={true} />);

        expect(openedByVisitor()).toBe(false);
      });

      it('should count the launcher as a visitor action', () => {
        render(<ChatWidget {...defaultProps} />);

        fireEvent.click(screen.getByTestId('chat-trigger'));

        expect(openedByVisitor()).toBe(true);
      });

      it('should count api.open() only while the page handles a click or key press of the visitor', () => {
        jest.useFakeTimers();
        render(<ChatWidget {...defaultProps} />);

        // A timer opens the chat.
        act(() => api().open());
        expect(openedByVisitor()).toBe(false);
        act(() => api().close());

        // A page button opens it in the handler of the visitor's click. jsdom
        // cannot dispatch a trusted event, so the test notes the event itself.
        act(() => {
          noteVisitorInput({ isTrusted: true, type: 'click' } as Event);
          api().open();
        });
        expect(openedByVisitor()).toBe(true);
        act(() => api().close());

        // The mark ends with the task of the event: a timer that runs later is no visitor action.
        act(() => {
          jest.runOnlyPendingTimers();
          api().open();
        });
        expect(openedByVisitor()).toBe(false);
      });

      it('should not count a click that a script dispatches', () => {
        const pageButton = document.createElement('button');
        pageButton.addEventListener('click', () => api().open());
        document.body.appendChild(pageButton);
        try {
          render(<ChatWidget {...defaultProps} />);

          act(() => {
            fireEvent.click(pageButton);
          });

          expect(screen.getByTestId('chat-window')).toBeInTheDocument();
          expect(openedByVisitor()).toBe(false);
        } finally {
          pageButton.remove();
        }
      });

      describe('a page that opens the chat a moment after the click', () => {
        // jsdom has no layout: a control that stays on the screen gets a box.
        const showOnScreen = (element: Element) => {
          element.getClientRects = () => [{ width: 80, height: 32 }] as unknown as DOMRectList;
        };
        // The window's listener notes the visitor's click before the page handles it.
        // jsdom cannot dispatch a trusted event, so the test notes the event itself.
        const clickAsVisitor = (element: HTMLElement) => {
          noteVisitorInput({ isTrusted: true, type: 'click', target: element } as unknown as Event);
          element.click();
        };

        it('should count api.open() that a page notice runs 200 ms after the Accept of the visitor', () => {
          jest.useFakeTimers();
          // The notice fades out, leaves the page, and then opens the chat (closeConsentPopup).
          const notice = document.createElement('div');
          const accept = document.createElement('button');
          accept.addEventListener('click', () => {
            setTimeout(() => {
              notice.remove();
              api().open();
            }, 200);
          });
          notice.appendChild(accept);
          document.body.appendChild(notice);
          showOnScreen(accept);
          try {
            render(<ChatWidget {...defaultProps} />);
            accept.focus();

            act(() => clickAsVisitor(accept));
            act(() => {
              jest.advanceTimersByTime(200);
            });

            expect(screen.getByTestId('chat-window')).toBeInTheDocument();
            expect(openedByVisitor()).toBe(true);
            // The Accept button left the page: on close, the launcher gets the focus.
            expect((globalThis as any).mockOpenerRef.current).toBeNull();
          } finally {
            notice.remove();
          }
        });

        it('should leave the focus on the page when a timer opens the chat after a click on a control that stays', () => {
          jest.useFakeTimers();
          const link = document.createElement('button');
          link.addEventListener('click', () => {
            setTimeout(() => api().open(), 300);
          });
          document.body.appendChild(link);
          showOnScreen(link);
          try {
            render(<ChatWidget {...defaultProps} />);

            act(() => clickAsVisitor(link));
            act(() => {
              jest.advanceTimersByTime(300);
            });

            expect(screen.getByTestId('chat-window')).toBeInTheDocument();
            expect(openedByVisitor()).toBe(false);
          } finally {
            link.remove();
          }
        });

        it('should count a chat toggle of the page that opens the chat a moment later', () => {
          jest.useFakeTimers();
          const toggle = document.createElement('button');
          toggle.setAttribute('data-punku-chat-toggle', '');
          toggle.addEventListener('click', () => {
            setTimeout(() => api().open(), 300);
          });
          document.body.appendChild(toggle);
          showOnScreen(toggle);
          try {
            render(<ChatWidget {...defaultProps} />);

            act(() => clickAsVisitor(toggle));
            act(() => {
              jest.advanceTimersByTime(300);
            });

            expect(openedByVisitor()).toBe(true);
          } finally {
            toggle.remove();
          }
        });

        it('should leave the focus in a page field that has it when the chat opens', () => {
          jest.useFakeTimers();
          const notice = document.createElement('div');
          const accept = document.createElement('button');
          const field = document.createElement('input');
          accept.addEventListener('click', () => {
            setTimeout(() => {
              notice.remove();
              api().open();
            }, 200);
          });
          notice.appendChild(accept);
          document.body.append(notice, field);
          showOnScreen(accept);
          try {
            render(<ChatWidget {...defaultProps} />);

            act(() => clickAsVisitor(accept));
            // The page puts the focus into its search field before its timer opens the chat.
            field.focus();
            act(() => {
              jest.advanceTimersByTime(200);
            });

            expect(openedByVisitor()).toBe(false);
            expect((globalThis as any).mockOpenerRef.current).toBe(field);
          } finally {
            notice.remove();
            field.remove();
          }
        });

        it('should not count a later open after the next press of the visitor', () => {
          jest.useFakeTimers();
          const notice = document.createElement('div');
          const accept = document.createElement('button');
          accept.addEventListener('click', () => {
            notice.remove();
            setTimeout(() => api().open(), 500);
          });
          notice.appendChild(accept);
          document.body.appendChild(notice);
          showOnScreen(accept);
          try {
            render(<ChatWidget {...defaultProps} />);

            act(() => clickAsVisitor(accept));
            // The visitor moves on: a press somewhere else, or a key.
            noteVisitorInput({ isTrusted: true, type: 'pointerdown', target: document.body } as unknown as Event);
            act(() => {
              jest.advanceTimersByTime(500);
            });

            expect(openedByVisitor()).toBe(false);
          } finally {
            notice.remove();
          }
        });
      });
    });

    it('should say the language of the launcher name, but not of the widget root or the hint (WCAG 3.1.2)', () => {
      render(<ChatWidget {...defaultProps} default_language="pl" show_closed_widget_hint={true} />);

      expect(screen.getByTestId('chat-trigger')).toHaveAttribute('lang', 'pl');
      expect(document.querySelector('.cl-widget-root')).not.toHaveAttribute('lang');
      // The hint can be the site's own text, in any language.
      expect(document.querySelector('.cl-closed-widget-hint')).not.toHaveAttribute('lang');
    });

    it('should hide closed widget hint when widget is open', () => {
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} />);

      expect(screen.getByText(defaultClosedHintText)).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('chat-trigger'));
      expect(screen.queryByText(defaultClosedHintText)).not.toBeInTheDocument();
    });
  });

  describe('Closed Widget Hint Timing', () => {
    it('should fade closed widget hint automatically after configured timeout', () => {
      jest.useFakeTimers();

      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_auto_hide_ms={1000} />);

      const hint = screen.getByText(defaultClosedHintText);
      expect(hint).toBeVisible();

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(hint).not.toBeVisible();
      jest.useRealTimers();
    });
  });

  describe('Closed Widget Hint Show Once', () => {
    it('should show the hint only once per browsing session by default', () => {
      const firstMount = render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} />);
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();
      firstMount.unmount();

      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} />);
      expect(screen.getByText(defaultClosedHintText)).not.toBeVisible();
    });

    it('should show the hint on every mount when closed_widget_hint_show_once is false', () => {
      const firstMount = render(
        <ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_show_once={false} />
      );
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();
      firstMount.unmount();

      render(
        <ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_show_once={false} />
      );
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();
    });

    it('should not re-show the hint after the user closes the chat window', () => {
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} />);
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();

      fireEvent.click(screen.getByTestId('chat-trigger'));
      expect(screen.queryByText(defaultClosedHintText)).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('chat-trigger'));
      expect(screen.getByText(defaultClosedHintText)).not.toBeVisible();
    });

    it('should scope the shown flag to the flow id', () => {
      const firstMount = render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} />);
      firstMount.unmount();

      render(<ChatWidget {...defaultProps} flow_id="another-flow-id" show_closed_widget_hint={true} />);
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();
    });

    it('should show the hint again in a new browsing session', () => {
      const firstMount = render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} />);
      firstMount.unmount();
      window.sessionStorage.clear();

      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} />);
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();
    });

    it('should not mark the hint as shown when it is disabled', () => {
      const firstMount = render(<ChatWidget {...defaultProps} />);
      firstMount.unmount();

      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} />);
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();
    });
  });

  describe('Responsive Hint Exposure', () => {
    it('lets the visible desktop embed claim the hint after a hidden mobile embed mounts first', () => {
      render(<>
        <div style={{ display: 'none' }}>
          <ChatWidget {...defaultProps} widget_id="mobile-test" show_closed_widget_hint={true} closed_widget_hint_text="Mobile hint" />
        </div>
        <ChatWidget {...defaultProps} widget_id="desktop-test" show_closed_widget_hint={true} closed_widget_hint_text="Desktop hint" />
      </>);
      expect(screen.getByText('Mobile hint')).not.toBeVisible();
      expect(screen.getByText('Desktop hint')).toBeVisible();
      expect(ClosedWidgetHintStorage.hasBeenShown(defaultProps.flow_id)).toBe(true);
    });

    it('starts the full timer after reveal, even when the hidden time exceeds that timer', () => {
      jest.useFakeTimers();
      const view = render(<div data-testid="responsive-container" style={{ display: 'none' }}>
        <ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_auto_hide_ms={1000} />
      </div>);
      act(() => { jest.advanceTimersByTime(2000); });
      expect(ClosedWidgetHintStorage.hasBeenShown(defaultProps.flow_id)).toBe(false);
      const container = screen.getByTestId('responsive-container');
      container.style.display = 'block';
      fireEvent.resize(window);
      act(() => { jest.advanceTimersByTime(20); });
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();
      expect(ClosedWidgetHintStorage.hasBeenShown(defaultProps.flow_id)).toBe(true);
      act(() => { jest.advanceTimersByTime(700); });
      fireEvent.resize(window);
      act(() => { jest.advanceTimersByTime(301); });
      expect(screen.getByText(defaultClosedHintText)).not.toBeVisible();
      view.unmount();
    });

    it('rechecks the shared flag before a hidden same-flow embed becomes visible', () => {
      jest.useFakeTimers();
      render(<>
        <div data-testid="phone-container" style={{ display: 'none' }}>
          <ChatWidget {...defaultProps} widget_id="phone-test" show_closed_widget_hint={true} closed_widget_hint_text="Phone hint" />
        </div>
        <div data-testid="desktop-container">
          <ChatWidget {...defaultProps} widget_id="desktop-test" show_closed_widget_hint={true} closed_widget_hint_text="Desktop hint" />
        </div>
      </>);
      expect(screen.getByText('Desktop hint')).toBeVisible();
      screen.getByTestId('desktop-container').style.display = 'none';
      screen.getByTestId('phone-container').style.display = 'block';
      fireEvent.resize(window);
      act(() => { jest.advanceTimersByTime(20); });
      expect(screen.getByText('Phone hint')).not.toBeVisible();
    });

    it('keeps the owning hint and its original deadline during StrictMode replay', () => {
      jest.useFakeTimers();
      render(<React.StrictMode>
        <ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_auto_hide_ms={1000} />
      </React.StrictMode>);
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();
      act(() => { jest.advanceTimersByTime(700); });
      fireEvent.resize(window);
      act(() => { jest.advanceTimersByTime(301); });
      expect(screen.getByText(defaultClosedHintText)).not.toBeVisible();
    });

    it('keeps a stable deadline when session storage is unavailable', () => {
      jest.useFakeTimers();
      jest.spyOn(ClosedWidgetHintStorage, 'hasBeenShown').mockReturnValue(false);
      const markShown = jest.spyOn(ClosedWidgetHintStorage, 'markShown').mockImplementation(() => {});
      render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_auto_hide_ms={1000} />);
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();
      act(() => { jest.advanceTimersByTime(700); });
      fireEvent.resize(window);
      act(() => { jest.advanceTimersByTime(301); });
      expect(screen.getByText(defaultClosedHintText)).not.toBeVisible();
      expect(markShown).toHaveBeenCalledTimes(1);
    });

    it('does not reclaim an old exposure after hint text changes away and back', () => {
      const view = render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_text="First hint" />);
      expect(screen.getByText('First hint')).toBeVisible();
      view.rerender(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_text="Changed hint" />);
      expect(screen.getByText('Changed hint')).not.toBeVisible();
      view.rerender(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_text="First hint" />);
      expect(screen.getByText('First hint')).not.toBeVisible();
    });

    it('cleans up the hint timer on unmount', () => {
      jest.useFakeTimers();
      const view = render(<ChatWidget {...defaultProps} show_closed_widget_hint={true} closed_widget_hint_auto_hide_ms={1000} />);
      expect(screen.getByText(defaultClosedHintText)).toBeVisible();
      view.unmount();
      expect(jest.getTimerCount()).toBe(0);
      fireEvent.resize(window);
      act(() => { jest.advanceTimersByTime(1001); });
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('Session Management', () => {
    it('should call getOrCreateSession on mount', () => {
      render(<ChatWidget {...defaultProps} />);

      expect(SessionStorage.getOrCreateSession).toHaveBeenCalledWith(
        'test-flow-id',
        undefined,
        expect.any(Object)
      );
    });

    it('should pass session_id to getOrCreateSession', () => {
      render(<ChatWidget {...defaultProps} session_id="custom-session-id" />);

      expect(SessionStorage.getOrCreateSession).toHaveBeenCalledWith(
        'test-flow-id',
        'custom-session-id',
        expect.any(Object)
      );
    });

    it('should pass session config with custom TTL', () => {
      render(<ChatWidget {...defaultProps} ttl_hours={48} idle_expiration_hours={2} />);

      expect(SessionStorage.getOrCreateSession).toHaveBeenCalledWith(
        'test-flow-id',
        undefined,
        { expiryHours: 48, idleExpiryHours: 2 }
      );
    });

    it('should call getOrCreateSession once across re-renders', () => {
      // A valid stored session, so that opening the widget does not start a new one
      (SessionStorage.getStoredSession as jest.Mock).mockReturnValue({
        sessionId: 'mock-session-id',
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        domain: 'localhost',
        flowId: 'test-flow-id'
      });
      (SessionStorage.isSessionExpired as jest.Mock).mockReturnValue(false);

      const { rerender } = render(<ChatWidget {...defaultProps} />);

      const trigger = screen.getByTestId('chat-trigger');
      fireEvent.click(trigger);
      fireEvent.click(trigger);
      rerender(<ChatWidget {...defaultProps} theme="dark" />);

      expect(SessionStorage.getOrCreateSession).toHaveBeenCalledTimes(1);
    });

    describe('with the real SessionStorage', () => {
      const { SessionStorage: RealSessionStorage } = jest.requireActual('../utils/sessionStorage');
      const delegated = [
        'getOrCreateSession',
        'getStoredSession',
        'isSessionExpired',
        'updateMessages',
        'clearSession'
      ] as const;
      const mocked = SessionStorage as unknown as Record<(typeof delegated)[number], jest.Mock>;

      // The Jest config uses resetMocks, so these implementations end with each test
      beforeEach(() => {
        window.localStorage.clear();
        delegated.forEach((name) => {
          mocked[name].mockImplementation((...args: any[]) => RealSessionStorage[name](...args));
        });
      });

      afterEach(() => {
        window.localStorage.clear();
      });

      it('should keep stored messages after a re-render when session_id is set', () => {
        render(<ChatWidget {...defaultProps} session_id="custom-session-id" start_open={true} />);

        fireEvent.click(screen.getByTestId('add-message'));
        // Close the widget: a re-render that does not change the messages
        fireEvent.click(screen.getByTestId('chat-trigger'));

        const stored = RealSessionStorage.getStoredSession('test-flow-id');
        expect(stored?.sessionId).toBe('custom-session-id');
        expect(stored?.messages).toHaveLength(1);
      });
    });

    it('should start new session when button is clicked', async () => {
      jest.useFakeTimers();

      render(<ChatWidget {...defaultProps} start_open={true} />);

      const newSessionButton = screen.getByTestId('new-session');
      fireEvent.click(newSessionButton);

      // Fast-forward timers for the setTimeout in startNewSession. Only the
      // pending ones: the check for page dialogs repeats every second.
      act(() => {
        jest.runOnlyPendingTimers();
      });

      jest.useRealTimers();
    });
  });

  describe('Message Management', () => {
    it('should start with empty messages for new session', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      expect(screen.getByTestId('message-count').textContent).toBe('0');
    });

    it('should add message when addMessage is called', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      const addButton = screen.getByTestId('add-message');
      fireEvent.click(addButton);

      expect(screen.getByTestId('message-count').textContent).toBe('1');
    });
  });

  describe('Language Support', () => {
    it('should default to English language', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      expect(screen.getByTestId('language').textContent).toBe('en');
    });

    it('should use default_language prop when provided', () => {
      render(<ChatWidget {...defaultProps} start_open={true} default_language="de" />);

      expect(screen.getByTestId('language').textContent).toBe('de');
    });

    it('should default to German for Swarovski theme', () => {
      render(<ChatWidget {...defaultProps} start_open={true} theme="swarovski" />);

      expect(screen.getByTestId('language').textContent).toBe('de');
    });

    it('should override Swarovski theme default with explicit default_language', () => {
      render(<ChatWidget {...defaultProps} start_open={true} theme="swarovski" default_language="en" />);

      expect(screen.getByTestId('language').textContent).toBe('en');
    });

    describe('from the page language', () => {
      afterEach(() => document.documentElement.removeAttribute('lang'));

      it('should use the page language without default_language', () => {
        document.documentElement.setAttribute('lang', 'it-IT');
        render(<ChatWidget {...defaultProps} start_open={true} />);

        expect(screen.getByTestId('language').textContent).toBe('it');
      });

      it('should follow a page that changes <html lang> later', async () => {
        document.documentElement.setAttribute('lang', 'it');
        render(<ChatWidget {...defaultProps} start_open={true} />);
        expect(screen.getByTestId('language').textContent).toBe('it');

        act(() => document.documentElement.setAttribute('lang', 'pl-PL'));
        await waitFor(() => expect(screen.getByTestId('language').textContent).toBe('pl'));

        // A page language the widget does not have: the browser language (en-US in jsdom).
        act(() => document.documentElement.setAttribute('lang', 'nl'));
        await waitFor(() => expect(screen.getByTestId('language').textContent).toBe('en'));
      });

      it('should keep an explicit default_language when the page language changes', async () => {
        document.documentElement.setAttribute('lang', 'it');
        render(<ChatWidget {...defaultProps} start_open={true} default_language="en" />);
        expect(screen.getByTestId('language').textContent).toBe('en');

        act(() => document.documentElement.setAttribute('lang', 'fr'));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(screen.getByTestId('language').textContent).toBe('en');
      });
    });
  });

  describe('Global API', () => {
    it('should expose global widget API', () => {
      render(<ChatWidget {...defaultProps} />);

      const api = (window as any)['punku-chat-widget_api'];
      expect(api).toBeDefined();
      expect(typeof api.open).toBe('function');
      expect(typeof api.close).toBe('function');
      expect(typeof api.isOpen).toBe('function');
      expect(typeof api.setTriggerPosition).toBe('function');
      expect(typeof api.resetTriggerPosition).toBe('function');
      expect(api.trigger).toBe((window as any).punku.trigger);
    });

    it('should expose API with custom widget_id', () => {
      render(<ChatWidget {...defaultProps} widget_id="custom-widget" />);

      const api = (window as any)['custom-widget_api'];
      expect(api).toBeDefined();
    });

    it('should open widget via API', () => {
      render(<ChatWidget {...defaultProps} />);

      const api = (window as any)['punku-chat-widget_api'];

      act(() => {
        api.open();
      });

      expect(screen.getByTestId('chat-window')).toBeInTheDocument();
    });

    it('should open widget and queue a message via API open argument', async () => {
      render(<ChatWidget {...defaultProps} />);

      const api = (window as any)['punku-chat-widget_api'];

      act(() => {
        api.open('Prefilled question');
      });

      expect(screen.getByTestId('chat-window')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId('message-count').textContent).toBe('1');
      });
    });

    it('should close widget via API', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      const api = (window as any)['punku-chat-widget_api'];

      act(() => {
        api.close();
      });

      expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
    });

    it('should report isOpen status via API', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      const api = (window as any)['punku-chat-widget_api'];
      expect(api.isOpen()).toBe(true);
    });

    it('should not expose trigger relocation APIs when disabled by config', () => {
      render(<ChatWidget {...defaultProps} enable_trigger_relocation={false} />);

      const api = (window as any)['punku-chat-widget_api'];
      expect(api.setTriggerPosition).toBeUndefined();
      expect(api.resetTriggerPosition).toBeUndefined();
      expect(api.trigger).toBeUndefined();
      expect((window as any).punku?.trigger).toBeUndefined();

      const widgetRoot = document.querySelector('.cl-widget-root');
      expect((widgetRoot as HTMLElement).style).toMatchObject({
        right: safeAreaGap('right', '20px'),
        bottom: safeAreaGap('bottom', '20px'),
        left: '',
        top: '',
        zIndex: String(DEFAULT_Z_INDEX),
      });
    });

    it('should expose trigger relocation APIs by default', () => {
      render(<ChatWidget {...defaultProps} />);

      const api = (window as any)['punku-chat-widget_api'];
      expect(typeof api.setTriggerPosition).toBe('function');
      expect(typeof api.resetTriggerPosition).toBe('function');
      expect(api.trigger).toBeDefined();
      expect(api.trigger).toBe((window as any).punku.trigger);
      expect(typeof api.trigger.setPosition).toBe('function');
      expect(typeof api.trigger.resetPosition).toBe('function');
      expect(api.trigger.position).toBeNull();
    });

    it('should relocate and reset the trigger through the default API', () => {
      render(<ChatWidget {...defaultProps} />);

      const api = (window as any)['punku-chat-widget_api'];
      const widgetRoot = document.querySelector('.cl-widget-root');

      act(() => {
        expect(api.setTriggerPosition({ x: 100, y: 300, zIndex: 10003 })).toBe(true);
      });

      expect(api.trigger.position).toEqual({ x: 100, y: 300, zIndex: 10003 });
      expect(widgetRoot).toHaveStyle({
        left: '100px',
        top: '300px',
        zIndex: '10003',
      });

      act(() => {
        (window as any).punku.trigger.position = { x: 20, y: 40 };
      });

      expect(api.trigger.position).toEqual({ x: 20, y: 40 });
      expect(widgetRoot).toHaveStyle({
        left: '20px',
        top: '40px',
        zIndex: String(DEFAULT_Z_INDEX),
      });

      act(() => {
        api.resetTriggerPosition();
      });

      expect(api.trigger.position).toBeNull();
      expect((widgetRoot as HTMLElement).style).toMatchObject({
        right: safeAreaGap('right', '20px'),
        bottom: safeAreaGap('bottom', '20px'),
        left: '',
        top: '',
        zIndex: String(DEFAULT_Z_INDEX),
      });
    });

    it('should stack the widget above typical host overlays by default', () => {
      render(<ChatWidget {...defaultProps} />);

      // Above WhatsApp-style buttons, below the banners of large consent tools.
      expect(DEFAULT_Z_INDEX).toBe(2147483000);
      expect(document.querySelector('.cl-widget-root')).toHaveStyle({ zIndex: '2147483000' });
    });

    it('should stay below a consent dialog of the page while it is visible', () => {
      // Borlabs Cookie: a modal dialog in a full-screen layer at 999999.
      const layer = document.createElement('div');
      layer.style.cssText = 'position: fixed; z-index: 999999;';
      layer.innerHTML = '<div role="alertdialog" aria-modal="true">Privacy settings</div>';
      layer.firstElementChild!.getBoundingClientRect = () => ({
        x: 20, y: 40, left: 20, top: 40, width: 280, height: 300, right: 300, bottom: 340, toJSON: () => ({}),
      }) as DOMRect;
      document.body.appendChild(layer);
      jest.useFakeTimers();
      try {
        render(<ChatWidget {...defaultProps} />);
        const widgetRoot = document.querySelector('.cl-widget-root') as HTMLElement;
        expect(widgetRoot.style.zIndex).toBe('999998');

        // The visitor answers the dialog: the widget returns to its own value.
        act(() => {
          layer.remove();
          jest.advanceTimersByTime(PAGE_DIALOG_CHECK_MS);
        });
        expect(widgetRoot.style.zIndex).toBe(String(DEFAULT_Z_INDEX));
      } finally {
        jest.useRealTimers();
        layer.remove();
      }
    });

    // A cookie bar of the page (CookieScript) at 999997. The trigger is 400-448 px.
    const addCookieBar = (top: number, height: number) => {
      const bar = document.createElement('div');
      bar.setAttribute('role', 'dialog');
      bar.setAttribute('aria-label', 'Cookie consent dialog');
      bar.style.cssText = 'position: fixed; z-index: 999997;';
      bar.getBoundingClientRect = () => ({
        x: 0, y: top, left: 0, top, width: 1024, height, right: 1024, bottom: top + height, toJSON: () => ({}),
      }) as DOMRect;
      document.body.appendChild(bar);
      return bar;
    };

    it('should take the launcher out of the tab order while a page dialog covers it (WCAG 2.4.11)', () => {
      const bar = addCookieBar(368, 400);
      jest.useFakeTimers();
      try {
        render(<ChatWidget {...defaultProps} />);
        const trigger = screen.getByTestId('chat-trigger');
        expect(trigger).toHaveAttribute('tabindex', '-1');
        // Not inert: a tap reaches the launcher as soon as the dialog has gone.
        expect(trigger.closest('[inert]')).toBeNull();

        // The visitor answers the dialog: Tab reaches the launcher again.
        act(() => {
          bar.remove();
          jest.advanceTimersByTime(PAGE_DIALOG_CHECK_MS);
        });
        expect(trigger).not.toHaveAttribute('tabindex');
      } finally {
        jest.useRealTimers();
        bar.remove();
      }
    });

    it('should look at the page again when the visitor presses Tab, before the focus moves', () => {
      const bar = addCookieBar(368, 400);
      jest.useFakeTimers();
      try {
        render(<ChatWidget {...defaultProps} />);
        const trigger = screen.getByTestId('chat-trigger');
        expect(trigger).toHaveAttribute('tabindex', '-1');

        // The dialog goes between two checks. A held Tab repeats: its first press did the check.
        bar.remove();
        fireEvent.keyDown(document.body, { key: 'Tab', repeat: true });
        expect(trigger).toHaveAttribute('tabindex', '-1');
        fireEvent.keyDown(document.body, { key: 'Tab' });
        expect(trigger).not.toHaveAttribute('tabindex');

        // A dialog that comes over the launcher: the next Tab skips it at once.
        const again = addCookieBar(368, 400);
        try {
          fireEvent.keyDown(document.body, { key: 'Tab' });
          expect(trigger).toHaveAttribute('tabindex', '-1');
        } finally {
          again.remove();
        }
      } finally {
        jest.useRealTimers();
        bar.remove();
      }
    });

    it('should keep the launcher in the tab order when a page dialog covers only a part of it or none', () => {
      const partly = addCookieBar(420, 348);
      try {
        render(<ChatWidget {...defaultProps} />);
        // The widget still goes below the dialog, but the visitor sees the launcher.
        expect((document.querySelector('.cl-widget-root') as HTMLElement).style.zIndex).toBe('999996');
        expect(screen.getByTestId('chat-trigger')).not.toHaveAttribute('tabindex');
      } finally {
        partly.remove();
      }
    });

    describe('the open window over the launcher (WCAG 2.4.11)', () => {
      // jsdom has no layout, and the mock window has no card. Put a stand-in
      // card in the window layer, where ChatWindow renders it. The trigger is
      // at 400-448 px (beforeEach).
      const addWindowCard = (left: number, top: number, width: number, height: number) => {
        const chatWindow = document.createElement('div');
        chatWindow.className = 'cl-chat-window';
        const card = document.createElement('div');
        card.className = 'cl-window';
        card.getBoundingClientRect = () => ({
          x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}),
        }) as DOMRect;
        chatWindow.appendChild(card);
        document.querySelector('.cl-window-layer')!.appendChild(chatWindow);
      };

      it('should take the launcher out of the tab order while the open window covers it, and back in the render that closes the chat', () => {
        render(<ChatWidget {...defaultProps} />);
        addWindowCard(0, 0, 1024, 768);
        const trigger = screen.getByTestId('chat-trigger');

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('tabindex', '-1');
        expect(trigger.closest('[inert]')).toBeNull();
        // The window header shows its close button instead.
        expect(screen.getByTestId('covers-trigger')).toHaveTextContent('true');

        (globalThis as any).mockTriggerTabIndexOnClose = undefined;
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(trigger).not.toHaveAttribute('tabindex');
        // ChatWindow gives the focus back to the launcher in an effect of that render.
        expect((globalThis as any).mockTriggerTabIndexOnClose).toBe(0);
      });

      it('should keep the launcher in the tab order while the open window leaves it visible', () => {
        render(<ChatWidget {...defaultProps} />);
        // Above the trigger, as on a desktop.
        addWindowCard(400, 0, 450, 380);

        fireEvent.click(screen.getByTestId('chat-trigger'));

        expect(screen.getByTestId('chat-trigger')).not.toHaveAttribute('tabindex');
        expect(screen.getByTestId('covers-trigger')).toHaveTextContent('false');
      });

      it('should keep the launcher out of the tab order while a page dialog or the window covers it', () => {
        jest.useFakeTimers();
        const bar = addCookieBar(368, 400);
        try {
          render(<ChatWidget {...defaultProps} />);
          addWindowCard(0, 0, 1024, 768);
          const trigger = screen.getByTestId('chat-trigger');
          act(() => {
            (window as any)['punku-chat-widget_api'].open();
          });
          expect(trigger).toHaveAttribute('tabindex', '-1');

          // The dialog goes: the window still covers the launcher.
          act(() => {
            bar.remove();
            jest.advanceTimersByTime(PAGE_DIALOG_CHECK_MS);
          });
          expect(trigger).toHaveAttribute('tabindex', '-1');

          act(() => {
            (window as any)['punku-chat-widget_api'].close();
          });
          expect(trigger).not.toHaveAttribute('tabindex');
        } finally {
          jest.useRealTimers();
          bar.remove();
        }
      });
    });

    // jsdom has no popovers: record the calls of the top layer.
    function mockPopovers() {
      const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
      const had = { show: 'showPopover' in proto, hide: 'hidePopover' in proto };
      const original = { show: proto.showPopover, hide: proto.hidePopover };
      const showPopover = jest.fn();
      const hidePopover = jest.fn();
      proto.showPopover = showPopover;
      proto.hidePopover = hidePopover;
      const restore = () => {
        if (had.show) proto.showPopover = original.show; else delete proto.showPopover;
        if (had.hide) proto.hidePopover = original.hide; else delete proto.hidePopover;
      };
      return { showPopover, hidePopover, restore };
    }

    it('should lift the open window to the top layer and take it back when it closes', () => {
      const popovers = mockPopovers();
      try {
        render(<ChatWidget {...defaultProps} start_open={true} />);
        const layer = document.querySelector('.cl-window-layer') as HTMLElement;
        expect(layer.getAttribute('popover')).toBe('manual');
        expect(popovers.showPopover).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTestId('chat-trigger'));
        expect(layer.hasAttribute('popover')).toBe(false);
        expect(popovers.hidePopover).toHaveBeenCalledTimes(1);
      } finally {
        popovers.restore();
      }
    });

    it('should keep the open window under a consent dialog of the page', () => {
      const popovers = mockPopovers();
      const layer = document.createElement('div');
      layer.style.cssText = 'position: fixed; z-index: 999999;';
      layer.innerHTML = '<div role="alertdialog" aria-modal="true">Privacy settings</div>';
      layer.firstElementChild!.getBoundingClientRect = () => ({
        x: 20, y: 40, left: 20, top: 40, width: 280, height: 300, right: 300, bottom: 340, toJSON: () => ({}),
      }) as DOMRect;
      document.body.appendChild(layer);
      try {
        render(<ChatWidget {...defaultProps} start_open={true} />);
        expect(document.querySelector('.cl-window-layer')!.hasAttribute('popover')).toBe(false);
        expect(document.querySelector('.cl-widget-root')).toHaveStyle({ zIndex: '999998' });
      } finally {
        popovers.restore();
        layer.remove();
      }
    });

    it.each([
      [500, '500'],
      [12.6, '13'],
      // A negative value could hide the trigger behind the page content.
      [-1, '0'],
      // 1e21 serializes as 1e+21, which CSS rejects. Clamp to the 32-bit maximum.
      [1e21, String(MAX_Z_INDEX)],
      [2147483648, String(MAX_Z_INDEX)],
      [NaN, String(DEFAULT_Z_INDEX)],
      [Infinity, String(DEFAULT_Z_INDEX)],
    ])('should apply the z_index prop %p to the widget root', (zIndex, expected) => {
      render(<ChatWidget {...defaultProps} z_index={zIndex} />);

      expect((document.querySelector('.cl-widget-root') as HTMLElement).style.zIndex).toBe(expected);
    });

    it('should let the relocation zIndex override the z_index prop', () => {
      render(<ChatWidget {...defaultProps} z_index={500} />);

      const api = (window as any)['punku-chat-widget_api'];
      const widgetRoot = document.querySelector('.cl-widget-root') as HTMLElement;

      act(() => {
        api.setTriggerPosition({ x: 100, y: 300, zIndex: 10003 });
      });
      expect(widgetRoot.style.zIndex).toBe('10003');

      act(() => {
        api.setTriggerPosition({ x: 100, y: 300 });
      });
      expect(widgetRoot.style.zIndex).toBe('500');

      act(() => {
        api.resetTriggerPosition();
      });
      expect(widgetRoot.style.zIndex).toBe('500');
    });

    it.each([
      [10003.5, 10004, '10004', '10005'],
      [1e21, MAX_Z_INDEX, String(MAX_Z_INDEX), String(MAX_Z_INDEX)],
      [-5, 0, '0', '1'],
    ])('should normalize the relocation zIndex %p like the z_index prop', (zIndex, stored, rootZIndex, windowZIndex) => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      const api = (window as any)['punku-chat-widget_api'];
      act(() => {
        expect(api.setTriggerPosition({ x: 100, y: 300, zIndex })).toBe(true);
      });

      expect(api.trigger.position).toEqual({ x: 100, y: 300, zIndex: stored });
      expect((document.querySelector('.cl-widget-root') as HTMLElement).style.zIndex).toBe(rootZIndex);
      // The window stays one layer above the trigger, but never above the maximum.
      expect(screen.getByTestId('chat-window').style.zIndex).toBe(windowZIndex);
    });

    it('should ignore a relocation zIndex that is not a finite number', () => {
      render(<ChatWidget {...defaultProps} z_index={500} />);

      const api = (window as any)['punku-chat-widget_api'];
      act(() => {
        api.setTriggerPosition({ x: 100, y: 300, zIndex: '10003' });
      });

      expect(api.trigger.position).toEqual({ x: 100, y: 300 });
      expect((document.querySelector('.cl-widget-root') as HTMLElement).style.zIndex).toBe('500');
    });

    it('should give the anchored window the tablet size that its placement used', () => {
      setViewportSize(750, 342);
      render(<ChatWidget {...defaultProps} start_open={true} width={300} height={230} />);

      const api = (window as any)['punku-chat-widget_api'];
      act(() => {
        api.setTriggerPosition({ x: 24, y: 120 });
      });

      // The CSS ignores the width and height props from 641 to 1023 px. The
      // window opens beside the trigger, because the screen is too short.
      const chatWindow = screen.getByTestId('chat-window');
      expect(chatWindow.style.top).toBe('70px');
      expect(chatWindow.style.left).toBe('84px');
      expect(chatWindow.style.getPropertyValue('--cl-anchored-window-width')).toBe('420px');
      expect(chatWindow.style.getPropertyValue('--cl-anchored-window-height')).toBe('256px');
    });

    it('should leave the desktop window size to the width and height props', () => {
      render(<ChatWidget {...defaultProps} start_open={true} width={300} height={230} />);

      const api = (window as any)['punku-chat-widget_api'];
      act(() => {
        api.setTriggerPosition({ x: 24, y: 120 });
      });

      const chatWindow = screen.getByTestId('chat-window');
      expect(chatWindow.style.top).toBe('200px');
      expect(chatWindow.style.left).toBe('24px');
      expect(chatWindow.style.getPropertyValue('--cl-anchored-window-width')).toBe('');
    });

    describe('anchored window after a screen change', () => {
      const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));
      const anchorTrigger = (position: { x: number; y: number }) => {
        act(() => {
          (window as any)['punku-chat-widget_api'].setTriggerPosition(position);
        });
      };
      const windowPlace = () => {
        const chatWindow = screen.getByTestId('chat-window');
        return {
          top: chatWindow.style.top,
          left: chatWindow.style.left,
          height: chatWindow.style.getPropertyValue('--cl-anchored-window-height'),
        };
      };

      afterEach(() => {
        delete (window as any).visualViewport;
      });

      it('should place and size the window again after a resize', async () => {
        setViewportSize(750, 342);
        render(<ChatWidget {...defaultProps} start_open={true} />);
        anchorTrigger({ x: 24, y: 120 });
        expect(windowPlace()).toEqual({ top: '70px', left: '84px', height: '256px' });

        // The browser toolbar hides, so the landscape screen grows.
        setViewportSize(750, 1000);
        await act(async () => {
          window.dispatchEvent(new Event('resize'));
          await nextFrame();
        });

        expect(windowPlace()).toEqual({ top: '200px', left: '24px', height: '600px' });
      });

      it('should place the window again after a rotation', async () => {
        setViewportSize(810, 1080);
        render(<ChatWidget {...defaultProps} start_open={true} />);
        anchorTrigger({ x: 24, y: 700 });
        expect(windowPlace()).toEqual({ top: '68px', left: '24px', height: '600px' });

        setViewportSize(1080, 810);
        await act(async () => {
          window.dispatchEvent(new Event('orientationchange'));
          await nextFrame();
        });

        // The desktop layout sizes the window from the props, not from the variables.
        expect(windowPlace()).toEqual({ top: '101px', left: '24px', height: '' });
      });

      it('should place the window again after a visual viewport resize', async () => {
        const visualViewport = new EventTarget();
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: visualViewport });
        setViewportSize(750, 342);
        render(<ChatWidget {...defaultProps} start_open={true} />);
        anchorTrigger({ x: 24, y: 120 });

        setViewportSize(750, 1000);
        await act(async () => {
          visualViewport.dispatchEvent(new Event('resize'));
          await nextFrame();
        });

        expect(windowPlace()).toEqual({ top: '200px', left: '24px', height: '600px' });
      });

      it('should keep the gap to the rendered trigger size', () => {
        setViewportSize(750, 342);
        render(<ChatWidget {...defaultProps} start_open={true} />);
        // chat_trigger_style or a large host root font size makes the trigger 72 px.
        const trigger = screen.getByTestId('chat-trigger');
        Object.defineProperty(trigger, 'offsetWidth', { configurable: true, value: 72 });
        Object.defineProperty(trigger, 'offsetHeight', { configurable: true, value: 72 });
        anchorTrigger({ x: 24, y: 120 });

        // 12 px right of the trigger: 24 + 72 + 12.
        expect(windowPlace()).toEqual({ top: '70px', left: '108px', height: '256px' });
      });
    });

    it('should position the closed hint from the relocated trigger side by default', () => {
      render(
        <ChatWidget
          {...defaultProps}
          show_closed_widget_hint={true}
          closed_widget_hint_position="left"
        />
      );

      const api = (window as any)['punku-chat-widget_api'];
      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-left');

      act(() => {
        api.trigger.setPosition({ x: 20, y: 300 });
      });

      expect(hint).toHaveClass('cl-hint-right');
      expect(hint).not.toHaveClass('cl-hint-left');
    });

    it('should align bottom closed hint from the relocated trigger side', () => {
      render(
        <ChatWidget
          {...defaultProps}
          show_closed_widget_hint={true}
          closed_widget_hint_position="bottom"
        />
      );

      const api = (window as any)['punku-chat-widget_api'];
      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');
      expect(hint).toHaveClass('cl-hint-bottom');

      act(() => {
        api.trigger.setPosition({ x: 20, y: 300 });
      });

      expect(hint).toHaveClass('cl-hint-bottom-left');
      expect(hint).not.toHaveClass('cl-hint-bottom');
    });

    it('should move top closed hint below a relocated top trigger', () => {
      render(
        <ChatWidget
          {...defaultProps}
          show_closed_widget_hint={true}
          closed_widget_hint_position="top"
        />
      );

      const api = (window as any)['punku-chat-widget_api'];
      const hint = screen.getByText(defaultClosedHintText).closest('.cl-closed-widget-hint');

      act(() => {
        api.trigger.setPosition({ x: 600, y: 20 });
      });

      expect(hint).toHaveClass('cl-hint-bottom');
      expect(hint).not.toHaveClass('cl-hint-top');
    });

    it('should clean up API on unmount', () => {
      const { unmount } = render(<ChatWidget {...defaultProps} />);

      expect((window as any)['punku-chat-widget_api']).toBeDefined();
      expect((window as any).punku?.trigger).toBeDefined();

      unmount();

      expect((window as any)['punku-chat-widget_api']).toBeUndefined();
      expect((window as any).punku).toBeUndefined();
    });
  });

  describe('Visible screen (#77)', () => {
    // jsdom has no visual viewport. Install a fake 412 x 839 phone screen.
    // The layout viewport is 455 x 927, as on a host page 43 px wider than
    // the screen in Chrome on Android, so the root sits at x 387-435, y 859-907.
    class FakeVisualViewport extends EventTarget {
      offsetLeft = 0;
      offsetTop = 0;
      width = 412;
      height = 839;
      scale = 1;
    }

    const jsdomVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const rootBox = { x: 387, y: 859, left: 387, top: 859, right: 435, bottom: 907, width: 48, height: 48, toJSON: () => ({}) };
    let viewport: FakeVisualViewport;
    // The fixed root and its trigger anchor have no accessible role. Their inline style is the result.
    // eslint-disable-next-line testing-library/no-node-access
    const root = () => document.querySelector('.cl-widget-root') as HTMLElement;
    const anchorTransform = () => (root().children[1] as HTMLElement).style.transform;
    const setPageWidth = (width: number) =>
      Object.defineProperty(document.documentElement, 'scrollWidth', { configurable: true, value: width });

    beforeEach(() => {
      viewport = new FakeVisualViewport();
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      const otherBox = HTMLElement.prototype.getBoundingClientRect;
      jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('cl-widget-root') ? rootBox as DOMRect : otherBox.call(this);
      });
      setPageWidth(412);
    });

    afterEach(() => {
      delete (document.documentElement as { scrollWidth?: number }).scrollWidth;
      if (jsdomVisualViewport) Object.defineProperty(window, 'visualViewport', jsdomVisualViewport);
      else delete (window as { visualViewport?: unknown }).visualViewport;
    });

    it('keeps the closed trigger at the layout viewport corner on a page that fits the screen', () => {
      render(<ChatWidget {...defaultProps} start_open={false} />);

      // The on-screen keyboard makes only the visible area smaller.
      viewport.height = 500;
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
      });

      expect(anchorTransform()).toBe('');
      expect(root().style).toMatchObject({ right: safeAreaGap('right', '20px'), bottom: safeAreaGap('bottom', '20px') });
    });

    it('moves the closed trigger to the visible corner on a page wider than the screen, and follows a pan', () => {
      setPageWidth(455);
      render(<ChatWidget {...defaultProps} start_open={false} />);
      expect(anchorTransform()).toBe('translate(-43px, -88px)');

      Object.assign(viewport, { offsetLeft: 43, offsetTop: 88 });
      act(() => {
        viewport.dispatchEvent(new Event('scroll'));
      });

      expect(anchorTransform()).toBe('');
      // The root keeps its plain offsets. Only the anchor moves, so the widget is not restyled.
      expect(root().style).toMatchObject({ right: safeAreaGap('right', '20px'), bottom: safeAreaGap('bottom', '20px') });
      expect(root().style.getPropertyValue('--cl-visual-viewport-top')).toBe('');
    });

    it('gives a hidden root no shift, and shifts it when host CSS shows it', () => {
      // A phone-only embed is display: none on a desktop. Its root has no box.
      setPageWidth(455);
      const jsdomResizeObserver = Object.getOwnPropertyDescriptor(window, 'ResizeObserver');
      const resizeCallbacks: ResizeObserverCallback[] = [];
      class FakeResizeObserver {
        constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: FakeResizeObserver });
      let shown = false;
      const hiddenBox = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
      jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        return (shown || !this.classList.contains('cl-widget-root') ? rootBox : hiddenBox) as DOMRect;
      });

      try {
        render(<ChatWidget {...defaultProps} start_open={false} />);
        expect(anchorTransform()).toBe('');

        shown = true;
        act(() => resizeCallbacks.forEach((callback) => callback([], {} as ResizeObserver)));
        expect(anchorTransform()).toBe('translate(-43px, -88px)');
      } finally {
        if (jsdomResizeObserver) Object.defineProperty(window, 'ResizeObserver', jsdomResizeObserver);
        else delete (window as { ResizeObserver?: unknown }).ResizeObserver;
      }
    });

    it('moves the trigger above the on-screen keyboard while the window is open', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);
      expect(anchorTransform()).toBe('translate(-43px, -88px)');

      viewport.height = 500;
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
      });
      expect(anchorTransform()).toBe('translate(-43px, -427px)');
    });

    it('keeps a relocated trigger at its x and y in px', () => {
      setPageWidth(455);
      render(<ChatWidget {...defaultProps} />);

      act(() => {
        expect((window as any)['punku-chat-widget_api'].setTriggerPosition({ x: 24, y: 120 })).toBe(true);
      });

      expect(anchorTransform()).toBe('');
      expect(root().style).toMatchObject({ left: '24px', top: '120px', right: '', bottom: '' });
    });

    it('stops following the visible box after unmount', () => {
      const { unmount } = render(<ChatWidget {...defaultProps} />);
      const removeListener = jest.spyOn(viewport, 'removeEventListener');

      unmount();

      expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    });
  });

  describe('Scaled page (#82)', () => {
    // A Wix page with width=320 on a 740 x 360 phone in landscape: the layout
    // viewport is 320 x 156 CSS px at a page scale of 2.3125.
    class FakeVisualViewport extends EventTarget {
      offsetLeft = 0;
      offsetTop = 0;
      width = 320;
      height = 156;
      scale = 2.3125;
    }

    const jsdomVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const documentRoot = document.documentElement as unknown as { clientWidth?: number; clientHeight?: number; scrollWidth?: number };
    let viewport: FakeVisualViewport;
    // The fixed root and its trigger anchor have no accessible role. Their inline style is the result.
    // eslint-disable-next-line testing-library/no-node-access
    const root = () => document.querySelector('.cl-widget-root') as HTMLElement;
    const anchor = () => root().children[1] as HTMLElement;

    beforeEach(() => {
      viewport = new FakeVisualViewport();
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      Object.defineProperty(documentRoot, 'clientWidth', { configurable: true, value: 320 });
      Object.defineProperty(documentRoot, 'clientHeight', { configurable: true, value: 156 });
      Object.defineProperty(documentRoot, 'scrollWidth', { configurable: true, value: 320 });
    });

    afterEach(() => {
      delete documentRoot.clientWidth;
      delete documentRoot.clientHeight;
      delete documentRoot.scrollWidth;
      if (jsdomVisualViewport) Object.defineProperty(window, 'visualViewport', jsdomVisualViewport);
      else delete (window as { visualViewport?: unknown }).visualViewport;
    });

    it('makes the root a frame that undoes the page scale', () => {
      render(<ChatWidget {...defaultProps} start_open={false} />);

      expect(root().style).toMatchObject({
        position: 'fixed',
        left: 'var(--cl-frame-left, 0px)',
        top: 'var(--cl-frame-top, 0px)',
        width: 'var(--cl-frame-width, 740px)',
        height: 'var(--cl-frame-height, 361px)',
        transform: `scale(${1 / 2.3125})`,
        pointerEvents: 'none',
        zIndex: '2147483000',
      });
      expect(root().style.getPropertyValue('--cl-frame-width')).toBe('740px');
      // The trigger takes the frame corner and gets the taps.
      // The offsets stay in page px: 20 page px are 46.25 frame px.
      expect(anchor().style).toMatchObject({
        position: 'absolute', right: safeAreaGap('right', '46.25px'), bottom: safeAreaGap('bottom', '46.25px'), pointerEvents: 'auto', transform: '',
      });
    });

    it('keeps the closed frame on the layout viewport and follows the keyboard while open', () => {
      render(<ChatWidget {...defaultProps} start_open={false} />);
      viewport.height = 80;
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
      });
      expect(root().style.getPropertyValue('--cl-frame-height')).toBe('360.75px');

      fireEvent.click(screen.getByTestId('chat-trigger'));
      expect(root().style.getPropertyValue('--cl-frame-height')).toBe('185px');
    });

    it('keeps a relocated trigger at its page x and y, unscaled', () => {
      render(<ChatWidget {...defaultProps} />);

      act(() => {
        expect((window as any)['punku-chat-widget_api'].setTriggerPosition({ x: 24, y: 120 })).toBe(true);
      });

      expect(root().style).toMatchObject({ left: '24px', top: '120px', transform: 'none' });
      expect(root().style.pointerEvents).toBe('');
    });
  });

  describe('getVisibleCornerShift', () => {
    const screen = { offsetLeft: 43, offsetTop: 88, width: 412, height: 839 };
    const offsets = { top: 20, right: 30, bottom: 40, left: 50 };

    it('measures each corner from the matching edges', () => {
      // Boxes at the corners of a 455 x 927 layout viewport.
      expect(getVisibleCornerShift({ left: 50, top: 20, right: 98, bottom: 68 }, screen, 'top-left', offsets)).toEqual({ x: 43, y: 88 });
      expect(getVisibleCornerShift({ left: 377, top: 20, right: 425, bottom: 68 }, screen, 'top-right', offsets)).toEqual({ x: 0, y: 88 });
      expect(getVisibleCornerShift({ left: 50, top: 839, right: 98, bottom: 887 }, screen, 'bottom-left', offsets)).toEqual({ x: 43, y: 0 });
      expect(getVisibleCornerShift({ left: 377, top: 839, right: 425, bottom: 887 }, screen, 'bottom-right', offsets)).toEqual({ x: 0, y: 0 });
    });
  });

  describe('readCornerOffsets', () => {
    const fallback = { top: 20, right: 30, bottom: 40, left: 50 };

    it('takes the insets that the browser resolves, with the safe areas', () => {
      // A browser resolves calc(20px + var(--cl-safe-area-bottom, 0px)) to px:
      // 54 px over a 34 px home indicator.
      const element = document.createElement('div');
      const computed = jest.spyOn(window, 'getComputedStyle').mockReturnValue(
        { top: '780px', right: '79px', bottom: '54px', left: 'auto' } as CSSStyleDeclaration
      );
      expect(readCornerOffsets(element, fallback)).toEqual({ top: 780, right: 79, bottom: 54, left: 50 });
      computed.mockRestore();
    });

    it('keeps the prop offsets where the inset does not resolve to px', () => {
      // jsdom keeps the calc() text.
      const element = document.createElement('div');
      element.style.bottom = safeAreaGap('bottom', '40px');
      expect(readCornerOffsets(element, fallback)).toEqual(fallback);
    });
  });

  describe('Props Passing', () => {
    it('should initialize with persisted messages from session storage', () => {
      (SessionStorage.getOrCreateSession as jest.Mock).mockReturnValueOnce({
        sessionId: 'mock-session-id',
        messages: [
          { message: 'Hello', isSend: true },
          { message: 'Hi there!', isSend: false }
        ],
        isNewSession: false
      });

      render(<ChatWidget {...defaultProps} start_open={true} />);

      expect(screen.getByTestId('message-count').textContent).toBe('2');
    });
  });

  describe('Theme Support', () => {
    const themes: Array<"default" | "dark" | "ocean" | "aurora" | "punku-ai-bookingkit" | "swarovski"> = [
      'default',
      'dark',
      'ocean',
      'aurora',
      'punku-ai-bookingkit',
      'swarovski'
    ];

    themes.forEach(theme => {
      it(`should render with ${theme} theme`, () => {
        render(<ChatWidget {...defaultProps} theme={theme} />);

        expect(screen.getByTestId('chat-trigger')).toBeInTheDocument();
      });
    });
  });
});
