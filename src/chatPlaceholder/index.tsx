import { MoreHorizontal } from "lucide-react";
import { ChatMessagePlaceholderType } from "../types/chatWidget";
import { useState, useEffect } from "react";

export default function ChatMessagePlaceholder({
  bot_message_style,
}: ChatMessagePlaceholderType) {
  const thinkingMessages = [
    "Processing your request…",
    "Analyzing the information…",
    "Gathering relevant details…",
    "Working on a response…",
    "Reviewing available data…",
    "Formulating an answer…",
    "Please wait while I complete this step…",
    "Verifying the details…",
    "Organizing the information…",
    "Checking for accuracy…",
    "Compiling the results…",
    "Evaluating possible answers…",
    "Confirming relevant context…",
  ];

  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex(Math.floor(Math.random() * thinkingMessages.length));
    }, 2500); // Change every 1.5 seconds

    return () => clearInterval(interval);
  }, [thinkingMessages.length]);

  return (
    <div
      className="cl-chat-message cl-justify-start"
    >
        <div style={bot_message_style} className={"cl-bot_message"}>
            <div className="cl-animate-pulse">
              {thinkingMessages[currentMessageIndex]}
            </div>
        </div>
    </div>
  );
}
