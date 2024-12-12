import Markdown from "react-markdown";
import { ChatMessageType } from "../../../types/chatWidget";
import remarkGfm from "remark-gfm";
import rehypeMathjax from "rehype-mathjax";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { useState } from "react";
import { sendFeedback } from "../../../controllers";

export default function ChatMessage({
  message,
  message_id,  // This is already destructured from props
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

  const handleFeedback = async (newFeedback: string) => {
    console.log("message_id", message_id);
    console.log("isSend", isSend);
    if (!message || isSend) return;
    
    try {
      await sendFeedback(
        host_url,
        message,
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
          {message}
        </div>
      ) : error ? (
        <div style={error_message_style} className={"cl-error_message"}>
          {message}
        </div>
      ) : (
        <div style={bot_message_style} className={"cl-bot_message"}>
          <Markdown 
            className={"markdown-body prose flex flex-col word-break-break-word"}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeMathjax]}
          >
            {message}
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
