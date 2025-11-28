import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatMessage from './index';
import { sendFeedback } from '../../../controllers';

// Mock react-markdown
jest.mock('react-markdown', () => {
  return function MockMarkdown({ children }: { children: string }) {
    return <div data-testid="markdown-content">{children}</div>;
  };
});

// Mock remark-gfm
jest.mock('remark-gfm', () => () => {});

// Mock rehype-mathjax
jest.mock('rehype-mathjax', () => () => {});

// Mock the controllers module
jest.mock('../../../controllers', () => ({
  sendFeedback: jest.fn()
}));

const mockedSendFeedback = sendFeedback as jest.MockedFunction<typeof sendFeedback>;

describe('ChatMessage', () => {
  const defaultProps = {
    message: 'Hello, world!',
    isSend: false,
    host_url: 'http://localhost:3000'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Message Rendering', () => {
    it('should render a user message correctly', () => {
      render(<ChatMessage {...defaultProps} isSend={true} />);

      const messageElement = screen.getByText('Hello, world!');
      expect(messageElement).toBeInTheDocument();
      expect(messageElement).toHaveClass('cl-user_message');
    });

    it('should render a bot message correctly', () => {
      render(<ChatMessage {...defaultProps} />);

      expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
    });

    it('should render an error message correctly', () => {
      render(<ChatMessage {...defaultProps} error={true} />);

      const container = document.querySelector('.cl-error_message');
      expect(container).toBeInTheDocument();
    });

    it('should apply custom user message style', () => {
      const customStyle = { backgroundColor: 'red' };
      render(
        <ChatMessage {...defaultProps} isSend={true} user_message_style={customStyle} />
      );

      const messageElement = document.querySelector('.cl-user_message');
      expect(messageElement).toHaveStyle({ backgroundColor: 'red' });
    });

    it('should apply custom bot message style', () => {
      const customStyle = { backgroundColor: 'blue' };
      render(<ChatMessage {...defaultProps} bot_message_style={customStyle} />);

      const messageElement = document.querySelector('.cl-bot_message');
      expect(messageElement).toHaveStyle({ backgroundColor: 'blue' });
    });

    it('should apply custom error message style', () => {
      const customStyle = { backgroundColor: 'orange' };
      render(
        <ChatMessage {...defaultProps} error={true} error_message_style={customStyle} />
      );

      const messageElement = document.querySelector('.cl-error_message');
      expect(messageElement).toHaveStyle({ backgroundColor: 'orange' });
    });
  });

  describe('Message Parsing', () => {
    it('should handle string messages', () => {
      render(<ChatMessage {...defaultProps} message="Simple string" isSend={true} />);
      expect(screen.getByText('Simple string')).toBeInTheDocument();
    });

    it('should handle null message', () => {
      render(<ChatMessage {...defaultProps} message={null as unknown as string} isSend={true} />);
      expect(screen.getByText('No message available')).toBeInTheDocument();
    });

    it('should handle message object with text property', () => {
      const messageObj = { text: 'Message from object' };
      render(<ChatMessage {...defaultProps} message={messageObj as unknown as string} isSend={true} />);
      expect(screen.getByText('Message from object')).toBeInTheDocument();
    });

    it('should handle message object with artifacts.message', () => {
      const messageObj = { artifacts: { message: 'Artifact message' } };
      render(<ChatMessage {...defaultProps} message={messageObj as unknown as string} isSend={true} />);
      expect(screen.getByText('Artifact message')).toBeInTheDocument();
    });

    it('should handle message object with messages array', () => {
      const messageObj = { messages: [{ message: 'Array message' }] };
      render(<ChatMessage {...defaultProps} message={messageObj as unknown as string} isSend={true} />);
      expect(screen.getByText('Array message')).toBeInTheDocument();
    });

    it('should handle complex nested outputs structure', () => {
      const messageObj = {
        outputs: [{
          outputs: {
            chat: { message: { text: 'Nested output message' } }
          }
        }]
      };
      render(<ChatMessage {...defaultProps} message={messageObj as unknown as string} isSend={true} />);
      expect(screen.getByText('Nested output message')).toBeInTheDocument();
    });

    it('should handle results.message.text structure', () => {
      const messageObj = {
        results: { message: { text: 'Results message' } }
      };
      render(<ChatMessage {...defaultProps} message={messageObj as unknown as string} isSend={true} />);
      expect(screen.getByText('Results message')).toBeInTheDocument();
    });
  });

  describe('Feedback System', () => {
    it('should show feedback buttons for bot messages', () => {
      render(
        <ChatMessage
          {...defaultProps}
          message_id="test-message-id"
        />
      );

      expect(screen.getByTitle('Thumbs up')).toBeInTheDocument();
      expect(screen.getByTitle('Thumbs down')).toBeInTheDocument();
    });

    it('should NOT show feedback buttons for user messages', () => {
      render(
        <ChatMessage
          {...defaultProps}
          isSend={true}
          message_id="test-message-id"
        />
      );

      expect(screen.queryByTitle('Thumbs up')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Thumbs down')).not.toBeInTheDocument();
    });

    it('should NOT show feedback buttons for welcome message', () => {
      render(
        <ChatMessage
          {...defaultProps}
          message_id="welcome-message"
        />
      );

      expect(screen.queryByTitle('Thumbs up')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Thumbs down')).not.toBeInTheDocument();
    });

    it('should NOT show feedback buttons for error messages', () => {
      render(
        <ChatMessage
          {...defaultProps}
          error={true}
          message_id="test-message-id"
        />
      );

      expect(screen.queryByTitle('Thumbs up')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Thumbs down')).not.toBeInTheDocument();
    });

    it('should call sendFeedback when thumbs up is clicked', async () => {
      mockedSendFeedback.mockResolvedValueOnce({} as any);

      render(
        <ChatMessage
          {...defaultProps}
          message_id="test-message-id"
          api_key="test-api-key"
        />
      );

      const thumbsUpButton = screen.getByTitle('Thumbs up');
      fireEvent.click(thumbsUpButton);

      await waitFor(() => {
        expect(mockedSendFeedback).toHaveBeenCalledWith(
          'http://localhost:3000',
          'test-message-id',
          'positive',
          'test-api-key',
          undefined
        );
      });
    });

    it('should call sendFeedback when thumbs down is clicked', async () => {
      mockedSendFeedback.mockResolvedValueOnce({} as any);

      render(
        <ChatMessage
          {...defaultProps}
          message_id="test-message-id"
        />
      );

      const thumbsDownButton = screen.getByTitle('Thumbs down');
      fireEvent.click(thumbsDownButton);

      await waitFor(() => {
        expect(mockedSendFeedback).toHaveBeenCalledWith(
          'http://localhost:3000',
          'test-message-id',
          'negative',
          undefined,
          undefined
        );
      });
    });

    it('should call onFeedbackUpdate callback when feedback is provided', async () => {
      mockedSendFeedback.mockResolvedValueOnce({} as any);
      const onFeedbackUpdate = jest.fn();

      render(
        <ChatMessage
          {...defaultProps}
          message_id="test-message-id"
          onFeedbackUpdate={onFeedbackUpdate}
        />
      );

      const thumbsUpButton = screen.getByTitle('Thumbs up');
      fireEvent.click(thumbsUpButton);

      await waitFor(() => {
        expect(onFeedbackUpdate).toHaveBeenCalledWith('test-message-id', 'positive');
      });
    });

    it('should initialize with existing positive feedback state', () => {
      render(
        <ChatMessage
          {...defaultProps}
          message_id="test-message-id"
          feedback="positive"
        />
      );

      const thumbsUpButton = screen.getByTitle('Thumbs up');
      expect(thumbsUpButton).toHaveClass('selected');
    });

    it('should initialize with existing negative feedback state', () => {
      render(
        <ChatMessage
          {...defaultProps}
          message_id="test-message-id"
          feedback="negative"
        />
      );

      const thumbsDownButton = screen.getByTitle('Thumbs down');
      expect(thumbsDownButton).toHaveClass('selected');
    });

    it('should revert feedback on error', async () => {
      mockedSendFeedback.mockRejectedValueOnce(new Error('Network error'));
      const onFeedbackUpdate = jest.fn();

      render(
        <ChatMessage
          {...defaultProps}
          message_id="test-message-id"
          onFeedbackUpdate={onFeedbackUpdate}
        />
      );

      const thumbsUpButton = screen.getByTitle('Thumbs up');
      fireEvent.click(thumbsUpButton);

      await waitFor(() => {
        expect(onFeedbackUpdate).toHaveBeenLastCalledWith('test-message-id', '');
      });
    });
  });

  describe('CSS Classes', () => {
    it('should have cl-justify-end class for user messages', () => {
      render(<ChatMessage {...defaultProps} isSend={true} />);

      const container = document.querySelector('.cl-chat-message');
      expect(container).toHaveClass('cl-justify-end');
    });

    it('should have cl-justify-start class for bot messages', () => {
      render(<ChatMessage {...defaultProps} />);

      const container = document.querySelector('.cl-chat-message');
      expect(container).toHaveClass('cl-justify-start');
    });
  });
});
