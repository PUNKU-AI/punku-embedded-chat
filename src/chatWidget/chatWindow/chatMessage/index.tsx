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
  show_feedback = false
}: ChatMessageType & {
  api_key?: string;
  additional_headers?: {[key: string]: string};
  host_url: string;
  show_feedback?: boolean;
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
          {show_feedback && !currentFeedback && !isSend && (
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
          {show_feedback && currentFeedback && (
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
