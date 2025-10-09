import { MoreHorizontal } from "lucide-react";
import { ChatMessagePlaceholderType } from "../types/chatWidget";
import { useState, useEffect } from "react";

export default function ChatMessagePlaceholder({
  bot_message_style,
}: ChatMessagePlaceholderType) {
  const thinkingMessages = [
    "Überlege…",
    "Durchdenke das…",
    "Moment, lass mich nachdenken…",
    "Analysiere gerade…",
    "Hmm, interessant…",
    "Verstehe…",
    "Lass mich das durchgehen…",
    "Überdenke die Details…",
    "Arbeite daran…",
    "Formuliere meine Gedanken…",
    "Fast da…",
    "Noch kurz…",
    "Setze das zusammen…",
    "Prüfe nochmal…",
    "Gleich fertig…",
    "Einen Moment bitte…",
    "Schaue mir das an…",
    "Denke nach…",
    "Verarbeite das…",
    "Hmm…",
    "Lass mich überlegen…",
    "Sammle meine Gedanken…",
    "Bereite die Antwort vor…",
    "Sortiere meine Gedanken…",
    "Bin gleich soweit…",
    "Bearbeite das gerade…",
    "Durchgehe die Informationen…",
    "Stelle das zusammen…",
    "Prüfe die Informationen…",
    "Ordne meine Gedanken…",
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
