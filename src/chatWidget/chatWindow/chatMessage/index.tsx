import Markdown from "react-markdown";
import { ChatMessageType } from "../../../types/chatWidget";
import remarkGfm from "remark-gfm";
import rehypeMathjax from "rehype-mathjax";
import { ThumbsUp, ThumbsDown } from "lucide-react";

export default function ChatMessage({
  message,
  isSend,
  error,
  user_message_style,
  bot_message_style,
  error_message_style,
}: ChatMessageType) {

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
          <div className="feedback-buttons">
            <button className="feedback-button" aria-label="Like">
              <ThumbsUp size={18} />
            </button>
            <button className="feedback-button" aria-label="Dislike">
              <ThumbsDown size={18} />
            </button>
          </div>
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
