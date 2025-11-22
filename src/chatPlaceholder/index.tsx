import { ChatMessagePlaceholderType } from "../types/chatWidget";
import { useState, useEffect } from "react";
import { crystallineThinkingMessages, Language } from "../translations";

export default function ChatMessagePlaceholder({
  bot_message_style,
  theme = "default",
  language = "en" as Language,
}: ChatMessagePlaceholderType) {
  const defaultThinkingMessages = [
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
    "Informationen werden überprüft…",
    "Stelle das zusammen…",
    "Prüfe die Informationen…",
    "Ordne meine Gedanken…",
  ];

  // Use crystalline messages for Swarovski theme, otherwise use default
  const isCrystalline = theme === "swarovski";
  const messages = isCrystalline
    ? crystallineThinkingMessages.map(msg => (language === 'de' ? msg.de : msg.en))
    : defaultThinkingMessages;

  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex(Math.floor(Math.random() * messages.length));
    }, 2500);

    return () => clearInterval(interval);
  }, [messages.length]);

  // For Swarovski theme, use special crystalline styling
  if (isCrystalline) {
    return (
      <div className="cl-chat-message cl-justify-start">
        <div className="cl-thinking-message">
          <span className="cl-thinking-icon">💎</span>
          <span>{messages[currentMessageIndex]}</span>
        </div>
      </div>
    );
  }

  // Default placeholder for other themes
  return (
    <div className="cl-chat-message cl-justify-start">
      <div style={bot_message_style} className={"cl-bot_message"}>
        <div className="cl-animate-pulse">
          {messages[currentMessageIndex]}
        </div>
      </div>
    </div>
  );
}
