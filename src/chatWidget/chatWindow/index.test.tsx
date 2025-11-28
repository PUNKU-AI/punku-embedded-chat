import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ChatWindow from './index';
import { sendMessage, streamMessage } from '../../controllers';

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

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

// Mock remark-gfm and rehype-mathjax
jest.mock('remark-gfm', () => () => {});
jest.mock('rehype-mathjax', () => () => {});

// Mock the components
jest.mock('./chatMessage', () => {
  return function MockChatMessage({ message, isSend }: { message: string; isSend: boolean }) {
    return <div data-testid={isSend ? 'user-message' : 'bot-message'}>{message}</div>;
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
    title
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
  }) {
    if (!isOpen) return null;
    return (
      <div data-testid="confirmation-modal">
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

  beforeEach(() => {
    jest.clearAllMocks();
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

    it('should render window title', () => {
      render(<ChatWindow {...defaultProps} window_title="Test Chat" />);

      expect(screen.getByText('Test Chat')).toBeInTheDocument();
    });

    it('should render input field', () => {
      render(<ChatWindow {...defaultProps} />);

      const input = document.querySelector('.cl-input-element');
      expect(input).toBeInTheDocument();
    });

    it('should render send button', () => {
      render(<ChatWindow {...defaultProps} />);

      const sendButton = document.querySelector('.cl-send-button');
      expect(sendButton).toBeInTheDocument();
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

    it('should show different placeholder when sending', async () => {
      mockedSendMessage.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ChatWindow {...defaultProps} enable_streaming={false} placeholder_sending="Sending..." />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(input.placeholder).toBe('Sending...');
      });
    });
  });

  describe('Sending Messages (Non-Streaming)', () => {
    it('should call sendMessage when send button is clicked', async () => {
      mockedSendMessage.mockResolvedValueOnce({
        data: { outputs: [], session_id: 'new-session' },
        status: 200,
        statusText: 'OK',
        headers: new Headers()
      });

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
      mockedSendMessage.mockResolvedValueOnce({
        data: { outputs: [], session_id: 'new-session' },
        status: 200,
        statusText: 'OK',
        headers: new Headers()
      });

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
      mockedSendMessage.mockResolvedValueOnce({
        data: { outputs: [], session_id: 'new-session' },
        status: 200,
        statusText: 'OK',
        headers: new Headers()
      });

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
      mockedSendMessage.mockResolvedValueOnce({
        data: { outputs: [], session_id: 'new-session' },
        status: 200,
        statusText: 'OK',
        headers: new Headers()
      });

      render(<ChatWindow {...defaultProps} enable_streaming={false} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockedSendMessage).toHaveBeenCalled();
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

    it('should show session refresh message when isRefreshingSession is true', () => {
      render(<ChatWindow {...defaultProps} isRefreshingSession={true} />);

      expect(screen.getByText('Session refreshing...')).toBeInTheDocument();
    });
  });

  describe('Theming', () => {
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

    it('should render header with custom icon', () => {
      render(<ChatWindow {...defaultProps} header_icon="https://example.com/icon.png" />);

      const headerIcon = document.querySelector('.cl-header-logo');
      expect(headerIcon).toBeInTheDocument();
      expect(headerIcon?.tagName.toLowerCase()).toBe('img');
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
});
