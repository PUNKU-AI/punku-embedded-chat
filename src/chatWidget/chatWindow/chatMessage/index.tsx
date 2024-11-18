import Markdown from "react-markdown";
import { ChatMessageType } from "../../../types/chatWidget";
import remarkGfm from "remark-gfm";
import rehypeMathjax from "rehype-mathjax";

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
            <button className="like-button">Like</button>
            <button className="dislike-button">Dislike</button>
          </div>
        </div>
      )}
      <style>{`
        .feedback-buttons {
          display: flex;
          justify-content: flex-end;
          margin-top: 8px;
        }

        .like-button, .dislike-button {
          margin-left: 8px;
          padding: 4px 8px;
          border: none;
          background-color: transparent;
          cursor: pointer;
          font-size: 1.5em;
          color: #007bff;
        }

        .like-button:hover, .dislike-button:hover {
          color: #0056b3;
        }
      `}</style>
    </div>
  );
}
