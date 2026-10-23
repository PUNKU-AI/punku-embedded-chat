import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import { ChatMessageType } from "../../../types/chatWidget";
import remarkGfm from "remark-gfm";
import { CircleAlert, ThumbsUp, ThumbsDown } from "lucide-react";
import { useState, useMemo } from "react";
import { sendFeedback } from "../../../controllers";
import { PunkuChatErrorPhase } from "../../clientErrors";
import BookingkitCheckoutLink from "../../components/BookingkitCheckoutLink";

// Pins a readable base text size on every message. The widget renders inside a
// closed shadow root, so without this the font-size inherits from the host page
// and shrinks on deployments whose body/root font-size is small. Spread first so
// consumer *_message_style props (which spread after) can still override it.
const DEFAULT_MESSAGE_TEXT_STYLE: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: 1.5,
};

function findMessageInObject(obj: any): string | null {
  // If obj is a string, return it
  if (typeof obj === "string") return obj;
  
  // If obj is null or not an object, return null
  if (!obj || typeof obj !== "object") return null;

  // Direct text property
  if (obj.text) return obj.text;
  
  // Check artifacts message
  if (obj.artifacts?.message) return obj.artifacts.message;

  // Check messages array
  if (Array.isArray(obj.messages)) {
    const message = obj.messages.find((m: { message: any }) => m.message)?.message;
    if (message) return message;
  }

  // Check outputs structure
  if (obj.outputs?.[0]?.outputs) {
    const output = obj.outputs[0].outputs;
    if (typeof output === "string") return output;
    
    // Try to find message in nested outputs
    for (const key in output) {
      if (output[key]?.message?.text) {
        return output[key].message.text;
      }
    }
  }

  // Check results structure
  if (obj.results?.message?.text) {
    return obj.results.message.text;
  }

  // Recursive search for message or text properties
  for (const key in obj) {
    if (typeof obj[key] === "object") {
      const found = findMessageInObject(obj[key]);
      if (found) return found;
    }
  }

  return null;
}

function parseMessage(message: any): string {
  try {
    // Handle null or undefined
    if (!message) return "No message available";

    // Handle string messages directly
    if (typeof message === "string") return message;

    // Try to find message in object structure
    const foundMessage = findMessageInObject(message);
    if (foundMessage) return foundMessage;

    // If we still haven't found anything, return a JSON string
    return JSON.stringify(message);
  } catch (error) {
    console.error("Error parsing message:", error, message);
    return "Error displaying message";
  }
}

type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[] };

const meaningfulChildren = (node: unknown) =>
  ((node as HastNode | undefined)?.children || []).filter(
    (child) => !(child.type === "text" && !(child.value || "").trim())
  );

/** True when an element holds exactly one link and nothing else but whitespace. */
export function isLinkOnly(node: unknown): boolean {
  const children = meaningfulChildren(node);
  return children.length === 1 && children[0].type === "element" && children[0].tagName === "a";
}

/**
 * True when a list item holds only a link. In a loose list (blank lines
 * between the items) markdown wraps the link in a paragraph: li > p > a.
 */
export function isLinkOnlyListItem(node: unknown): boolean {
  if (isLinkOnly(node)) return true;
  const children = meaningfulChildren(node);
  return children.length === 1 && children[0].type === "element" && children[0].tagName === "p" && isLinkOnly(children[0]);
}

export default function ChatMessage({
  message,
  message_id,
  isSend,
  error,
  user_message_style,
  bot_message_style,
  error_message_style,
  feedback,
  api_key,
  additional_headers,
  host_url,
  onFeedbackUpdate,
  onClientError,
  onCheckout,
  isLatest = false,
  onRetry,
  retryLabel = "Try again",
  helpfulLabel = "Helpful",
  notHelpfulLabel = "Not helpful",
}: ChatMessageType & {
  api_key?: string;
  additional_headers?: {[key: string]: string};
  host_url: string;
  onFeedbackUpdate?: (messageId: string, feedbackType: string) => void;
  onCheckout?: (url: string, opener: HTMLAnchorElement) => boolean;
  /** The newest answer keeps its feedback buttons visible. */
  isLatest?: boolean;
  onClientError?: (
    error: unknown,
    phase: PunkuChatErrorPhase,
    context?: Record<string, unknown>
  ) => void;
  /** Shown on the newest error message: sends the visitor's last message again. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Names of the feedback buttons for screen readers, in the chat language. */
  helpfulLabel?: string;
  notHelpfulLabel?: string;
}) {
  // Parse message content once and memoize it
  const parsedMessage = useMemo(() => parseMessage(message), [message]);

  // Keep the opener mounted so checkout can capture and restore its focus.
  // A link that stands alone in a paragraph or list item is an action: it
  // renders as a button (see .cl-link-only in the widget stylesheet).
  const markdownComponents = useMemo<Components>(() => ({
    a: ({ href, children, node, ...props }) => (
      <BookingkitCheckoutLink href={href} onCheckout={onCheckout} {...props}>
        {children}
      </BookingkitCheckoutLink>
    ),
    p: ({ node, children, ...props }) => (
      <p {...props} className={isLinkOnly(node) ? "cl-link-only" : undefined}>{children}</p>
    ),
    // react-markdown 8 passes ordered, checked and index to list items; they
    // are not DOM attributes.
    li: ({ node, children, ordered, checked, index, className, ...props }) => (
      <li {...props} className={[className, isLinkOnlyListItem(node) ? "cl-link-only" : ""].filter(Boolean).join(" ") || undefined}>
        {children}
      </li>
    ),
  }), [onCheckout]);

  // Initialize feedback state from the message's feedback property
  const [selectedFeedback, setSelectedFeedback] = useState<'thumbsUp' | 'thumbsDown' | null>(
    feedback === 'positive' ? 'thumbsUp' :
    feedback === 'negative' ? 'thumbsDown' :
    null
  );

  // The width keys of bot_message_style size the stack around the bubble, so
  // the stack's default width limit never caps a site's wider answers. The
  // bubble then fills the stack; percentages still refer to the message row.
  const {
    width: answerWidth,
    minWidth: answerMinWidth,
    maxWidth: answerMaxWidth,
    ...answerStyleRest
  } = bot_message_style || {};
  const answerStackStyle: React.CSSProperties | undefined =
    answerWidth === undefined && answerMinWidth === undefined && answerMaxWidth === undefined
      ? undefined
      : { width: answerWidth, minWidth: answerMinWidth, maxWidth: answerMaxWidth };
  const answerBubbleStyle: React.CSSProperties = {
    ...answerStyleRest,
    ...(answerWidth !== undefined ? { width: "100%" } : {}),
    ...(answerMinWidth !== undefined ? { minWidth: "100%" } : {}),
  };

  const handleFeedback = async (type: 'thumbsUp' | 'thumbsDown') => {
    setSelectedFeedback(type);
    const feedbackValue = type === 'thumbsUp' ? 'positive' : 'negative';

    // Update the message data with feedback
    if (onFeedbackUpdate && message_id) {
      onFeedbackUpdate(message_id, feedbackValue);
    }

    // Send feedback to server for AI messages
    if (!isSend && message_id && host_url) {
      try {
        await sendFeedback(
          host_url,
          message_id,
          feedbackValue,
          api_key,
          additional_headers
        );
        // console.log(`Feedback sent: ${feedbackValue} (positive_feedback: ${type === 'thumbsUp' ? 'true' : 'false'})`);
      } catch (error) {
        console.error("Error sending feedback:", error);
        onClientError?.(error, "send-feedback", {
          messageId: message_id,
          feedback: feedbackValue,
        });
        // Optionally revert the selection if feedback fails
        setSelectedFeedback(null);
        // Also revert the message data
        if (onFeedbackUpdate && message_id) {
          onFeedbackUpdate(message_id, ''); // Clear feedback
        }
      }
    }
  };

  return (
    <div
      className={
        "cl-chat-message " + (isSend ? " cl-justify-end" : " cl-justify-start") + (isLatest ? " cl-latest" : "")
      }
    >
      {isSend ? (
        <div 
          style={{
            ...DEFAULT_MESSAGE_TEXT_STYLE,
            ...(user_message_style || {}),
          }} 
          className="cl-user_message"
        >
          {parsedMessage}
        </div>
      ) : error ? (
        <div
          style={{
            ...DEFAULT_MESSAGE_TEXT_STYLE,
            ...(error_message_style || {}),
          }}
          // A site's error_message_style may set only some colours. Start from the
          // classic red box then, so a partial style never gives unreadable text.
          className={
            "cl-error_message" +
            (error_message_style && Object.keys(error_message_style).length > 0
              ? " cl-error_message--custom"
              : "")
          }
        >
          <CircleAlert className="cl-error-icon" size={18} aria-hidden="true" />
          <span className="cl-error-text">{parsedMessage}</span>
          {onRetry && (
            <button type="button" className="cl-retry-btn" onClick={onRetry}>
              {retryLabel}
            </button>
          )}
        </div>
      ) : (
        // The answer bubble, with the feedback buttons under it (not inside it).
        <div className="cl-message-stack" style={answerStackStyle}>
          <div
            style={{
              ...DEFAULT_MESSAGE_TEXT_STYLE,
              ...answerBubbleStyle,
            }}
            className={"cl-bot_message"}
          >
            <Markdown
              className={"markdown-body prose flex flex-col word-break-break-word"}
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {parsedMessage}
            </Markdown>
          </div>

          {/* Simple thumbs up/down feedback - hide for welcome message */}
          {!isSend && !error && message_id !== "welcome-message" && (
            <div className="feedback-container">
              <div className="feedback-buttons">
                <button
                  type="button"
                  className={`feedback-button thumbs-up ${selectedFeedback === 'thumbsUp' ? 'selected' : ''}`}
                  onClick={() => handleFeedback('thumbsUp')}
                  aria-label={helpfulLabel}
                  aria-pressed={selectedFeedback === 'thumbsUp'}
                  title={helpfulLabel}
                >
                  <ThumbsUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`feedback-button thumbs-down ${selectedFeedback === 'thumbsDown' ? 'selected' : ''}`}
                  onClick={() => handleFeedback('thumbsDown')}
                  aria-label={notHelpfulLabel}
                  aria-pressed={selectedFeedback === 'thumbsDown'}
                  title={notHelpfulLabel}
                >
                  <ThumbsDown size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`
        .feedback-container {
          margin-top: 8px;
          display: flex;
          justify-content: flex-end;
        }
        
        .feedback-buttons {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        
        .feedback-button {
          padding: 4px;
          border: none;
          background: none;
          cursor: pointer;
          color: #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s ease;
          opacity: 0.7;
        }
        
        .feedback-button:hover {
          opacity: 1;
        }

        .feedback-button:focus-visible {
          opacity: 1;
          outline: 2px solid currentColor;
          outline-offset: 2px;
          border-radius: 4px;
        }
        
        .feedback-button.thumbs-up:hover {
          color: #10b981;
        }
        
        .feedback-button.thumbs-down:hover {
          color: #ef4444;
        }
        
        .feedback-button.thumbs-up.selected {
          color: #10b981;
          outline: 2px solid #10b981;
          outline-offset: 2px;
          border-radius: 4px;
        }
        
        .feedback-button.thumbs-down.selected {
          color: #ef4444;
          outline: 2px solid #ef4444;
          outline-offset: 2px;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
