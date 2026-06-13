import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatWindow from './index';
import { streamMessage } from '../../controllers';

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// Mock the controllers
jest.mock('../../controllers', () => ({
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

// Mock the components. Surface show_feedback so tests can assert the prop is
// threaded from ChatWindow into ChatMessage (the actual gating behavior is
// covered in chatMessage/index.test.tsx).
jest.mock('./chatMessage', () => {
  return function MockChatMessage({
    message,
    isSend,
    show_feedback
  }: {
    message: string;
    isSend: boolean;
    show_feedback?: boolean;
  }) {
    return (
      <div
        data-testid={isSend ? 'user-message' : 'bot-message'}
        data-show-feedback={String(Boolean(show_feedback))}
      >
        {message}
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

const mockedStreamMessage = streamMessage as jest.MockedFunction<typeof streamMessage>;

describe('ChatWindow', () => {
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
    sessionId: mockSessionId as React.MutableRefObject<string>
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: a stream that resolves immediately with no events
    mockedStreamMessage.mockImplementation(() => Promise.resolve());
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

      const chatWindow = document.querySelector('.cl-chat-window');
      expect(chatWindow).toHaveStyle({ left: 'auto', right: '20px' });
    });

    it('should anchor to the bottom left for bottom-left position', () => {
      render(<ChatWindow {...defaultProps} position="bottom-left" />);

      const chatWindow = document.querySelector('.cl-chat-window');
      expect(chatWindow).toHaveStyle({ left: '20px', right: 'auto' });
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
      mockedStreamMessage.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ChatWindow {...defaultProps} placeholder_sending="Sending..." />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(input.placeholder).toBe('Sending...');
      });
    });
  });

  describe('Sending Messages', () => {
    it('should call streamMessage when send button is clicked', async () => {
      render(<ChatWindow {...defaultProps} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockedStreamMessage).toHaveBeenCalledWith(
          'http://localhost:3000',
          'test-flow-id',
          'Hello',
          'chat',
          'chat',
          expect.any(Object),
          undefined,
          undefined,
          'test-api-key',
          undefined,
          expect.any(Function),
          expect.any(Function),
          expect.any(Function)
        );
      });
    });

    it('should call addMessage with user message', async () => {
      const addMessage = jest.fn();

      render(<ChatWindow {...defaultProps} addMessage={addMessage} />);

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
      render(<ChatWindow {...defaultProps} />);

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

      expect(mockedStreamMessage).not.toHaveBeenCalled();
    });

    it('should not send whitespace-only messages', () => {
      render(<ChatWindow {...defaultProps} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(sendButton);

      expect(mockedStreamMessage).not.toHaveBeenCalled();
    });

    it('should send message on Enter key press', async () => {
      render(<ChatWindow {...defaultProps} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;

      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockedStreamMessage).toHaveBeenCalled();
      });
    });

    it('should send a programmatic message', async () => {
      const addMessage = jest.fn();
      const onProgrammaticMessageHandled = jest.fn();

      render(
        <ChatWindow
          {...defaultProps}
          addMessage={addMessage}
          programmaticMessage={{ id: 1, message: 'Prefilled question' }}
          onProgrammaticMessageHandled={onProgrammaticMessageHandled}
        />
      );

      await waitFor(() => {
        expect(mockedStreamMessage).toHaveBeenCalledWith(
          'http://localhost:3000',
          'test-flow-id',
          'Prefilled question',
          'chat',
          'chat',
          expect.any(Object),
          undefined,
          undefined,
          'test-api-key',
          undefined,
          expect.any(Function),
          expect.any(Function),
          expect.any(Function)
        );
      });
      expect(addMessage).toHaveBeenCalledWith({
        message: 'Prefilled question',
        isSend: true
      });
      expect(onProgrammaticMessageHandled).toHaveBeenCalledWith(1);
    });

    it('should append a new error message when the stream fails before any reply', async () => {
      const addMessage = jest.fn();
      // Simulate a stream that errors before any bot token arrives
      mockedStreamMessage.mockImplementation(
        (
          _baseUrl,
          _flowId,
          _message,
          _input_type,
          _output_type,
          _sessionId,
          _output_component,
          _tweaks,
          _api_key,
          _additional_headers,
          _onStreamData,
          _onStreamEnd,
          onStreamError
        ) => {
          onStreamError?.(new Error('Boom'));
          return Promise.resolve();
        }
      );

      render(<ChatWindow {...defaultProps} addMessage={addMessage} />);

      const input = document.querySelector('.cl-input-element') as HTMLInputElement;
      const sendButton = document.querySelector('.cl-send-button') as HTMLButtonElement;

      fireEvent.change(input, { target: { value: 'Hello' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        // The user's message is added, and the error is appended as its OWN
        // message (not via updateLastMessage, which would overwrite the user's).
        expect(addMessage).toHaveBeenCalledWith({ message: 'Hello', isSend: true });
        expect(addMessage).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Boom', isSend: false, error: true })
        );
      });
      expect(defaultProps.updateLastMessage).not.toHaveBeenCalled();
    });
  });

  describe('Feedback visibility', () => {
    it('should thread show_feedback=false to messages by default', () => {
      render(<ChatWindow {...defaultProps} messages={[{ message: 'Bot', isSend: false }]} />);

      // The non-welcome bot message should receive show_feedback=false
      const botMessages = screen.getAllByTestId('bot-message');
      const rendered = botMessages.find((el) => el.textContent === 'Bot');
      expect(rendered).toHaveAttribute('data-show-feedback', 'false');
    });

    it('should thread show_feedback=true to messages when enabled', () => {
      render(
        <ChatWindow
          {...defaultProps}
          show_feedback={true}
          messages={[{ message: 'Bot', isSend: false }]}
        />
      );

      const botMessages = screen.getAllByTestId('bot-message');
      const rendered = botMessages.find((el) => el.textContent === 'Bot');
      expect(rendered).toHaveAttribute('data-show-feedback', 'true');
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

    it('should render header with custom lucide icon name', () => {
      render(<ChatWindow {...defaultProps} header_icon_name="Bot" />);

      const headerIcon = document.querySelector('.cl-header-logo');
      expect(headerIcon).toBeInTheDocument();
      expect(headerIcon?.tagName.toLowerCase()).toBe('svg');
    });

    it('should fall back to the default header icon for an unknown icon name', () => {
      render(<ChatWindow {...defaultProps} header_icon_name="ThisIconDoesNotExist" />);

      const headerIcon = document.querySelector('.cl-header-logo');
      expect(headerIcon).toBeInTheDocument();
      expect(headerIcon?.tagName.toLowerCase()).toBe('svg');
    });
  });

  describe('Branding', () => {
    it('should show only PUNKU.AI branding by default', () => {
      render(<ChatWindow {...defaultProps} online={true} />);

      expect(screen.getByText('PUNKU.AI')).toBeInTheDocument();
      expect(screen.queryByText('bookingkit')).not.toBeInTheDocument();
    });

    it('should show bookingkit co-branding only for the punku-ai-bookingkit theme', () => {
      render(<ChatWindow {...defaultProps} online={true} theme="punku-ai-bookingkit" />);

      expect(screen.getByText('PUNKU.AI')).toBeInTheDocument();
      expect(screen.getByText('bookingkit')).toBeInTheDocument();
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
    it('should show placeholder while sending before the first streamed token', async () => {
      mockedStreamMessage.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ChatWindow {...defaultProps} />);

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
