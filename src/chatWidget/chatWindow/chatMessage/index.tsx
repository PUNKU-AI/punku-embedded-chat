import Markdown from "react-markdown";
import { ChatMessageType } from "../../../types/chatWidget";
import remarkGfm from "remark-gfm";
import rehypeMathjax from "rehype-mathjax";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { useState, useMemo } from "react";
import { sendFeedback } from "../../../controllers";

function parseMessage(message: any): string {
  try {
    // Handle null or undefined
    if (!message) return "No message available";

    // Handle string messages directly
    if (typeof message === "string") return message;

    // Handle Langflow message format
    if (typeof message === "object") {
      // Check for text property
      if (message.text) return message.text;
      
      // Check for nested message
      if (message.message) {
        if (typeof message.message === "string") return message.message;
        if (typeof message.message === "object" && message.message.text) {
          return message.message.text;
        }
      }

      // Handle array of messages
      if (Array.isArray(message)) {
        return message
          .map(item => parseMessage(item))
          .filter(Boolean)
          .join("\n");
      }

      // If we have type and content
      if (message.type && message.content) {
        return message.content;
      }

      // Fallback to JSON stringify for unknown object structures
      return JSON.stringify(message);
    }

    // Final fallback for any other type
    return String(message);
  } catch (error) {
    console.error("Error parsing message:", error);
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
  host_url
}: ChatMessageType & {
  api_key?: string;
  additional_headers?: {[key: string]: string};
  host_url: string;
}) {
  const [currentFeedback, setCurrentFeedback] = useState(feedback);

  // Parse message content once and memoize it
  const parsedMessage = useMemo(() => parseMessage(message), [message]);

  const handleFeedback = async (newFeedback: string) => {
    if (!parsedMessage || isSend) return;
    
    try {
      await sendFeedback(
        host_url,
        parsedMessage,
        newFeedback,
        api_key,
        additional_headers
      );
      setCurrentFeedback(newFeedback);
    } catch (error) {
      console.error("Error sending feedback:", error);
    }
  };

  return (
    <div
      className={
        "cl-chat-message " + (isSend ? " cl-justify-end" : " cl-justify-start")
      }
    >
      {isSend ? (
        <div style={user_message_style} className="cl-user_message">
          {parsedMessage}
        </div>
      ) : error ? (
        <div style={error_message_style} className={"cl-error_message"}>
          {parsedMessage}
        </div>
      ) : (
        <div style={bot_message_style} className={"cl-bot_message"}>
          <Markdown 
            className={"markdown-body prose flex flex-col word-break-break-word"}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeMathjax]}
          >
            {parsedMessage}
          </Markdown>
          {!currentFeedback && !isSend && (
            <div className="feedback-buttons">
              <button 
                className="feedback-button" 
                onClick={() => handleFeedback("Good Response")}
                aria-label="Like"
              >
                <ThumbsUp size={18} />
              </button>
              <button 
                className="feedback-button" 
                onClick={() => handleFeedback("Bad Response")}
                aria-label="Dislike"
              >
                <ThumbsDown size={18} />
              </button>
            </div>
          )}
          {currentFeedback && (
            <div className="feedback-response">
              {currentFeedback === "Good Response" ? "👍" : "👎"} Thank you for your feedback!
            </div>
          )}
        </div>
      )}
      <style>{`
        .feedback-buttons {
          display: flex;
          justify-content: flex-end;
          margin-top: 8px;
          gap: 8px;
        }
        .feedback-button {
          padding: 4px;
          border: none;
          background-color: transparent;
          cursor: pointer;
          color: #6b7280;
          border-radius: 4px;
          display: flex;
          align-items: center;
          transition: all 0.2s;
        }
        .feedback-button:hover {
          color: #3b82f6;
          background-color: rgba(59, 130, 246, 0.1);
        }
      `}</style>
    </div>
  );
}
