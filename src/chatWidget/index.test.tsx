import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock the child components before importing ChatWidget
jest.mock('./chatTrigger', () => {
  return function MockChatTrigger({
    open,
    setOpen,
    triggerRef
  }: {
    open: boolean;
    setOpen: (open: boolean) => void;
    triggerRef: React.RefObject<HTMLButtonElement>;
  }) {
    return (
      <button
        ref={triggerRef}
        data-testid="chat-trigger"
        onClick={() => setOpen(!open)}
      >
        {open ? 'Close' : 'Open'}
      </button>
    );
  };
});

jest.mock('./chatWindow', () => {
  return function MockChatWindow({
    open,
    messages,
    addMessage,
    onStartNewSession,
    onClose,
    language
  }: {
    open: boolean;
    messages: any[];
    addMessage: (msg: any) => void;
    onStartNewSession?: () => void;
    onClose?: () => void;
    language?: string;
  }) {
    if (!open) return null;
    return (
      <div data-testid="chat-window">
        <span data-testid="message-count">{messages?.length || 0}</span>
        <span data-testid="language">{language || 'en'}</span>
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
import ChatWidget from './index';
import { SessionStorage } from '../utils/sessionStorage';
import { PAGE_DIALOG_CHECK_MS } from './pageDialogs';

describe('ChatWidget', () => {
  const defaultProps = {
    host_url: 'http://localhost:3000',
    flow_id: 'test-flow-id',
    input_value: 'test',
    input_type: 'chat',
    output_type: 'chat'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset window global
    delete (window as any)['punku-chat-widget_api'];

    // Reset mock implementation
    (SessionStorage.getOrCreateSession as jest.Mock).mockReturnValue({
      sessionId: 'mock-session-id',
      messages: [],
      isNewSession: true
    });
  });

  describe('Rendering', () => {
    it('should render the chat trigger', () => {
      render(<ChatWidget {...defaultProps} />);

      expect(screen.getByTestId('chat-trigger')).toBeInTheDocument();
    });

    it('should not show chat window by default', () => {
      render(<ChatWidget {...defaultProps} />);

      expect(screen.queryByTestId('chat-window')).not.toBeInTheDocument();
    });

    it('should show chat window when start_open is true', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);

      expect(screen.getByTestId('chat-window')).toBeInTheDocument();
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
  });

  describe('Global API', () => {
    it('should expose global widget API', () => {
      render(<ChatWidget {...defaultProps} />);

      const api = (window as any)['punku-chat-widget_api'];
      expect(api).toBeDefined();
      expect(typeof api.open).toBe('function');
      expect(typeof api.close).toBe('function');
      expect(typeof api.isOpen).toBe('function');
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

    it('should clean up API on unmount', () => {
      const { unmount } = render(<ChatWidget {...defaultProps} />);

      expect((window as any)['punku-chat-widget_api']).toBeDefined();

      unmount();

      expect((window as any)['punku-chat-widget_api']).toBeUndefined();
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

  describe('Stacking on the page', () => {
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

    // A consent dialog in its own layer. jsdom has no layout: give the
    // dialog a box on the screen.
    function addConsentDialog(zIndex: number) {
      const layer = document.createElement('div');
      layer.style.cssText = `position: fixed; z-index: ${zIndex};`;
      layer.innerHTML = '<div role="alertdialog" aria-modal="true">Privacy settings</div>';
      layer.firstElementChild!.getBoundingClientRect = () => ({
        x: 20, y: 40, left: 20, top: 40, width: 280, height: 300, right: 300, bottom: 340, toJSON: () => ({}),
      }) as DOMRect;
      document.body.appendChild(layer);
      return layer;
    }

    const windowLayer = () => document.querySelector('.cl-window-layer') as HTMLElement;
    const widgetRoot = () => document.querySelector('.cl-widget-root') as HTMLElement;

    it('should lift the open window to the top layer and take it back when it closes', () => {
      const popovers = mockPopovers();
      try {
        render(<ChatWidget {...defaultProps} start_open={true} />);
        expect(windowLayer().getAttribute('popover')).toBe('manual');
        expect(popovers.showPopover).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTestId('chat-trigger'));
        expect(windowLayer().hasAttribute('popover')).toBe(false);
        expect(popovers.hidePopover).toHaveBeenCalledTimes(1);
      } finally {
        popovers.restore();
      }
    });

    it('should lift the window that the page opens through the API', () => {
      // The Swarovski page hides the trigger and opens the window with its own button.
      const popovers = mockPopovers();
      try {
        render(<ChatWidget {...defaultProps} chat_trigger_style={{ display: 'none' }} />);
        expect(windowLayer().hasAttribute('popover')).toBe(false);

        act(() => {
          (window as any)['punku-chat-widget_api'].open();
        });
        expect(windowLayer().getAttribute('popover')).toBe('manual');

        act(() => {
          (window as any)['punku-chat-widget_api'].close();
        });
        expect(windowLayer().hasAttribute('popover')).toBe(false);
        expect(popovers.showPopover).toHaveBeenCalledTimes(1);
        expect(popovers.hidePopover).toHaveBeenCalledTimes(1);
      } finally {
        popovers.restore();
      }
    });

    it('should keep the z-index in browsers without popovers', () => {
      render(<ChatWidget {...defaultProps} start_open={true} />);
      expect(windowLayer().hasAttribute('popover')).toBe(false);
      expect(widgetRoot()).toHaveStyle({ zIndex: '9998' });
    });

    it('should keep the open window under a consent dialog of the page', () => {
      const popovers = mockPopovers();
      // Usercentrics on Swarovski: a layer at 2147483646, above the widget already.
      const dialog = addConsentDialog(2147483646);
      try {
        render(<ChatWidget {...defaultProps} start_open={true} />);
        expect(windowLayer().hasAttribute('popover')).toBe(false);
        expect(popovers.showPopover).not.toHaveBeenCalled();
        expect(widgetRoot()).toHaveStyle({ zIndex: '9998' });
      } finally {
        popovers.restore();
        dialog.remove();
      }
    });

    it('should go below a consent dialog in a lower layer', () => {
      const dialog = addConsentDialog(5000);
      try {
        render(<ChatWidget {...defaultProps} />);
        expect(widgetRoot()).toHaveStyle({ zIndex: '4999' });
      } finally {
        dialog.remove();
      }
    });

    it('should lift the open window when the consent dialog closes', () => {
      jest.useFakeTimers();
      const popovers = mockPopovers();
      const dialog = addConsentDialog(2147483646);
      try {
        render(<ChatWidget {...defaultProps} start_open={true} />);
        expect(windowLayer().hasAttribute('popover')).toBe(false);

        dialog.remove();
        act(() => {
          jest.advanceTimersByTime(PAGE_DIALOG_CHECK_MS);
        });
        expect(windowLayer().getAttribute('popover')).toBe('manual');
        expect(popovers.showPopover).toHaveBeenCalledTimes(1);
      } finally {
        popovers.restore();
        dialog.remove();
        jest.useRealTimers();
      }
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
