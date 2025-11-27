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

  // For Swarovski theme, use special crystalline styling with crystal image
  if (isCrystalline) {
    return (
      <div className="cl-chat-message cl-justify-start">
        <div className="cl-thinking-message cl-swarovski-thinking">
          <img
            src="/SKW_2408_Pictograms_crystal.png"
            alt="Crystal"
            className="cl-crystal-loader"
          />
          <span>{messages[currentMessageIndex]}</span>
        </div>
        <style>{`
          .cl-crystal-loader {
            width: 32px;
            height: 32px;
            animation: crystalRotate 3s linear infinite;
            filter: brightness(1.2) drop-shadow(0 0 8px rgba(100, 149, 237, 0.6));
          }

          @keyframes crystalRotate {
            0% {
              transform: rotateY(0deg);
            }
            100% {
              transform: rotateY(360deg);
            }
          }

          .cl-swarovski-thinking {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: #f5f5f5;
            border-radius: 2px;
            color: #666666;
            font-style: italic;
            font-size: 14px;
            font-family: "Euclid Circular B", Arial, sans-serif;
          }
        `}</style>
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
