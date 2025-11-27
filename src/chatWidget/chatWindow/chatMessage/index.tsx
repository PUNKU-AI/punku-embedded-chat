import Markdown from "react-markdown";
import { ChatMessageType } from "../../../types/chatWidget";
import remarkGfm from "remark-gfm";
import rehypeMathjax from "rehype-mathjax";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { useState, useMemo } from "react";
import { sendFeedback } from "../../../controllers";

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
}: ChatMessageType & {
  api_key?: string;
  additional_headers?: {[key: string]: string};
  host_url: string;
  onFeedbackUpdate?: (messageId: string, feedbackType: string) => void;
}) {
  // Parse message content once and memoize it
  const parsedMessage = useMemo(() => parseMessage(message), [message]);

  // Initialize feedback state from the message's feedback property
  const [selectedFeedback, setSelectedFeedback] = useState<'thumbsUp' | 'thumbsDown' | null>(
    feedback === 'positive' ? 'thumbsUp' :
    feedback === 'negative' ? 'thumbsDown' :
    null
  );

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
        "cl-chat-message " + (isSend ? " cl-justify-end" : " cl-justify-start")
      }
    >
      {isSend ? (
        <div 
          style={{
            ...(user_message_style || {}),
          }} 
          className="cl-user_message"
        >
          {parsedMessage}
        </div>
      ) : error ? (
        <div style={error_message_style} className={"cl-error_message"}>
          {parsedMessage}
        </div>
      ) : (
        <div 
          style={{
            ...(bot_message_style || {}),
          }} 
          className={"cl-bot_message"}
        >
          <Markdown
            className={"markdown-body prose flex flex-col word-break-break-word"}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeMathjax]}
          >
            {parsedMessage}
          </Markdown>
          <style>{`
            .cl-bot_message .markdown-body,
            .cl-bot_message .markdown-body * {
              font-family: inherit !important;
            }
          `}</style>
          
          {/* Simple thumbs up/down feedback - hide for welcome message */}
          {!isSend && !error && message_id !== "welcome-message" && (
            <div className="feedback-container">
              <div className="feedback-buttons">
                <button 
                  className={`feedback-button thumbs-up ${selectedFeedback === 'thumbsUp' ? 'selected' : ''}`}
                  onClick={() => handleFeedback('thumbsUp')}
                  aria-label="Thumbs up"
                  title="Thumbs up"
                >
                  <ThumbsUp size={16} />
                </button>
                <button 
                  className={`feedback-button thumbs-down ${selectedFeedback === 'thumbsDown' ? 'selected' : ''}`}
                  onClick={() => handleFeedback('thumbsDown')}
                  aria-label="Thumbs down"
                  title="Thumbs down"
                >
                  <ThumbsDown size={16} />
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
