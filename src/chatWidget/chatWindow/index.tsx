import { Send, MessagesSquare } from "lucide-react";
import { extractMessageFromOutput, getAnimationOrigin, getChatPosition } from "../utils";
import React, { useEffect, useRef, useState } from "react";
import { ChatMessageType } from "../../types/chatWidget";
import ChatMessage from "./chatMessage";
import { sendMessage } from "../../controllers";
import ChatMessagePlaceholder from "../../chatPlaceholder";
import PunkuLogo from "../../components/PunkuLogo";
import LanguageSwitcher from "../../components/LanguageSwitcher";
import { Language, translations } from "../../translations";

export default function ChatWindow({
  api_key,
  flowId,
  hostUrl,
  updateLastMessage,
  messages,
  output_type,
  input_type,
  output_component,
  bot_message_style,
  send_icon_style,
  user_message_style,
  chat_window_style,
  error_message_style,
  placeholder_sending,
  send_button_style,
  online = true,
  open,
  online_message,
  offline_message,
  window_title = "Chat",
  placeholder,
  input_style,
  input_container_style,
  addMessage,
  position,
  triggerRef,
  width = 450,
  height = 650,
  tweaks,
  sessionId,
  additional_headers,
  theme = "default",
  welcome_message,
  show_feedback = false,
  language,
  setLanguage,
  header_icon,
  background_color,
  bot_message_color,
  user_message_color,
  button_color,
  button_text_color,
  bot_message_text_color,
  user_message_text_color
}: {
  api_key?: string;
  output_type: string,
  input_type: string,
  output_component?: string,
  bot_message_style?: React.CSSProperties;
  send_icon_style?: React.CSSProperties;
  user_message_style?: React.CSSProperties;
  chat_window_style?: React.CSSProperties;
  error_message_style?: React.CSSProperties;
  send_button_style?: React.CSSProperties;
  online?: boolean;
  open: boolean;
  online_message?: string;
  placeholder_sending?: string;
  offline_message?: string;
  window_title?: string;
  placeholder?: string;
  input_style?: React.CSSProperties;
  input_container_style?: React.CSSProperties;
  tweaks?: { [key: string]: any };
  flowId: string;
  hostUrl: string;
  updateLastMessage: Function;
  messages: ChatMessageType[];
  addMessage: Function;
  position?: string;
  triggerRef: React.RefObject<HTMLButtonElement>;
  width?: number;
  height?: number;
  sessionId: React.MutableRefObject<string>;
  additional_headers?: { [key: string]: string };
  theme?: "default" | "dark" | "ocean" | "aurora";
  welcome_message?: string;
  show_feedback?: boolean;
  language: Language;
  setLanguage: React.Dispatch<React.SetStateAction<Language>>;
  header_icon?: string;
  background_color?: string;
  bot_message_color?: string;
  user_message_color?: string;
  button_color?: string;
  button_text_color?: string;
  bot_message_text_color?: string;
  user_message_text_color?: string;
}) {
  const [value, setValue] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);
  const lastMessage = useRef<HTMLDivElement>(null);
  const [windowPosition, setWindowPosition] = useState<{ 
    left: string; 
    top: string; 
    bottom?: string; 
    right?: string; 
  }>({ left: "0", top: "0" });
  const inputRef = useRef<HTMLInputElement>(null); /* User input Ref */
  useEffect(() => {
    if (triggerRef)
      setWindowPosition(
        getChatPosition(
          triggerRef.current!.getBoundingClientRect(),
          width,
          height,
          position
        )
      );
  }, [triggerRef, width, height, position]);

  /* Initial listener for loss of focus that refocuses User input after a small delay */

  const [sendingMessage, setSendingMessage] = useState(false);

  function handleClick() {
    if (value && value.trim() !== "") {
      addMessage({ message: value, isSend: true });
      setSendingMessage(true);
      setValue("");
      sendMessage(hostUrl, flowId, value, input_type, output_type, sessionId, output_component, tweaks, api_key, additional_headers)
        .then((res) => {
          if (
            res.data &&
            res.data.outputs &&
            Object.keys(res.data.outputs).length > 0 &&
            res.data.outputs[0].outputs && res.data.outputs[0].outputs.length > 0
          ) {
            const flowOutputs: Array<any> = res.data.outputs[0].outputs;
            if (output_component &&
              flowOutputs.map(e => e.component_id).includes(output_component)) {
              Object.values(flowOutputs.find(e => e.component_id === output_component).outputs).forEach((output: any) => {
                addMessage({
                  message: extractMessageFromOutput(output),
                  message_id: output.id || output.component_id,
                  isSend: false,
                });
              })
            } else if (
              flowOutputs.length === 1
            ) {
              Object.values(flowOutputs[0].outputs).forEach((output: any) => {
                addMessage({
                  message: extractMessageFromOutput(output),
                  message_id: output.id || output.component_id,
                  isSend: false,
                });
              })
            } else {
              flowOutputs
              .sort((a, b) => {
                // Get the earliest timestamp from each flowOutput's outputs
                const aTimestamp = Math.min(...Object.values(a.outputs).map((output: any) => Date.parse(output.message?.timestamp)));
                const bTimestamp = Math.min(...Object.values(b.outputs).map((output: any) => Date.parse(output.message?.timestamp)));
                return aTimestamp - bTimestamp; // Sort descending (newest first)
              })
              .forEach((flowOutput) => {
                Object.values(flowOutput.outputs).forEach((output: any) => {
                  addMessage({
                    message: extractMessageFromOutput(output),
                    isSend: false,
                  });
                });
              });
            }
          }
          if (res.data && res.data.session_id) {
            sessionId.current = res.data.session_id;
          }
          setSendingMessage(false);
        })
        .catch((err) => {
          const response = err.response;
          if (err.code === "ERR_NETWORK") {
            updateLastMessage({
              message: "Network error",
              isSend: false,
              error: true,
            });
          } else if (
            response &&
            response.status === 500 &&
            response.data &&
            response.data.detail
          ) {
            updateLastMessage({
              message: response.data.detail,
              isSend: false,
              error: true,
            });
          }
          console.error(err);
          setSendingMessage(false);
        });
    }
  }

  useEffect(() => {
    if (lastMessage.current)
      lastMessage.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* Refocus the User input whenever a new response is returned from the LLM */

  useEffect(() => {
    // after a slight delay
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, [messages, open]);

  // Get translations based on current language
  const t = translations[language];
  
  // Add theme-specific title modifications
  const displayTitle = window_title || t.windowTitle;
  
  // Determine welcome message
  const displayWelcomeMessage = welcome_message || t.welcomeMessage;

  return (
    <div
      className={
        "cl-chat-window" +
        (open ? " cl-scale-100" : " cl-scale-0")
      }
      style={{ 
        position: "fixed", 
        bottom: "100px",
        right: "20px",
        maxHeight: "70vh",
        maxWidth: "90vw",
        transform: "none !important", // Override any transforms with !important
        zIndex: 9999
      }}
    >
      {/* Custom style overrides for when custom colors are provided */}
      <style>
        {`
          .cl-window.custom-theme {
            background-color: ${background_color || '#FFFFFF'} !important;
            background-image: none !important;
          }
          .cl-window.custom-theme * {
            background-image: none !important;
          }
          .cl-window.custom-theme .cl-messages_container {
            background-color: ${background_color || '#FFFFFF'} !important;
            background-image: none !important;
          }
          .cl-window.custom-theme .cl-bot_message,
          .cl-window.custom-theme .cl-bot-message {
            background-color: ${bot_message_color || '#EDEADD'} !important;
            color: ${bot_message_text_color || '#333333'} !important;
          }
          .cl-window.custom-theme .cl-user_message {
            background-color: ${user_message_color || '#4A90E2'} !important;
            color: ${user_message_text_color || '#FFFFFF'} !important;
          }
          .cl-window.custom-theme .cl-messages_container {
            background-color: ${background_color || '#FFFFFF'} !important;
            background-image: none !important;
          }
          .cl-window.custom-theme .cl-header {
            background-color: ${button_color || '#4A90E2'} !important;
            color: ${button_text_color || '#FFFFFF'} !important;
          }
          .cl-window.custom-theme .cl-input_container {
            background-color: ${background_color || '#FFFFFF'} !important;
            border-color: transparent !important;
          }
          /* Send button styling is handled inline */
        `}
      </style>
      
      <div
        style={{ 
          ...chat_window_style, 
          width, 
          height, 
          minWidth: width,
          ...(background_color ? {backgroundColor: `${background_color} !important`} : {})
        }}
        ref={ref}
        className={`cl-window ${(button_color || background_color || bot_message_color || user_message_color) ? "custom-theme" : (theme ? `theme-${theme}` : "")}`}
      >
        <div className="cl-header" style={button_color ? {backgroundColor: `${button_color} !important`, color: `${button_text_color || '#FFFFFF'} !important`} : undefined}>
          <div className="cl-header-content">
            {header_icon ? (
              <img 
                src={header_icon} 
                alt="Chat icon" 
                className="cl-header-logo" 
                width="24" 
                height="24"
              />
            ) : (
              <div className="cl-default-header-icon">
                <MessagesSquare 
                  className="cl-header-logo" 
                  color="white" 
                  size={24}
                />
              </div>
            )}
            {displayTitle}
            <LanguageSwitcher 
              language={language} 
              onLanguageChange={setLanguage} 
            />
          </div>
          <div className="cl-header-subtitle" style={button_color ? {color: `${button_text_color || '#FFFFFF'} !important`} : undefined}>
            {online ? (
              <>
                <div className="cl-online-message"></div>
                {online_message || t.onlineMessage}
              </>
            ) : (
              <>
                <div className="cl-offline-message"></div>
                {offline_message || t.offlineMessage}
              </>
            )}
          </div>
        </div>
        
        <div className="cl-messages_container" style={background_color ? { backgroundColor: `${background_color} !important` } : undefined}>
          {/* Welcome message - only show if there are no messages yet */}
          {messages.length === 0 && (
            <div className="cl-messages">
              <div 
                className={`cl-message cl-bot_message`} 
                style={{
                  ...(bot_message_style || {}),
                  ...(bot_message_color ? {backgroundColor: `${bot_message_color} !important`} : {}),
                  ...(bot_message_text_color ? {color: `${bot_message_text_color} !important`} : {})
                }}
              >
                <div className="cl-message-content">
                  <div className="cl-message-text">{displayWelcomeMessage}</div>
                </div>
              </div>
            </div>
          )}
          
          {messages.map((message, index) => (
            <ChatMessage
              bot_message_style={
                bot_message_style || 
                (bot_message_color || bot_message_text_color ? 
                  {
                    ...(bot_message_color ? {backgroundColor: `${bot_message_color} !important`} : {}),
                    ...(bot_message_text_color ? {color: `${bot_message_text_color} !important`} : {})
                  } : undefined)
              }
              user_message_style={
                user_message_style || 
                (user_message_color || user_message_text_color ? 
                  {
                    ...(user_message_color ? {backgroundColor: `${user_message_color} !important`} : {}),
                    ...(user_message_text_color ? {color: `${user_message_text_color} !important`} : {})
                  } : undefined)
              }
              error_message_style={error_message_style}
              key={index}
              message_id={message.message_id}
              message={message.message}
              isSend={message.isSend}
              error={message.error}
              feedback={message.feedback}
              api_key={api_key}
              additional_headers={additional_headers}
              host_url={hostUrl}
              show_feedback={show_feedback}
            />
          ))}
          {sendingMessage && (
            <ChatMessagePlaceholder bot_message_style={bot_message_style} />
          )}
          <div ref={lastMessage}></div>
        </div>
        <div style={{...input_container_style, ...(button_color ? {backgroundColor: `${button_color} !important`, borderColor: 'transparent !important'} : {})}} className="cl-input_container">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleClick();
            }}
            type="text"
            disabled={sendingMessage}
            placeholder={sendingMessage ? (placeholder_sending || t.placeholderSending) : (placeholder || t.placeholder)}
            style={{
              ...input_style, 
              ...(button_color ? {
                backgroundColor: 'rgba(255,255,255,0.1) !important', 
                color: `${button_text_color || '#FFFFFF'} !important`
              } : {})
            }}
            ref={inputRef}
            className="cl-input-element"
          />
          {button_color && (
            <style>
              {`.cl-input-element::placeholder { 
                color: rgba(255,255,255,0.6) !important; 
              }`}
            </style>
          )}
          <button
            className="cl-send-button"
            style={{
              // Base styles
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              margin: '8px',
              cursor: 'pointer',
              // Always set button color directly if provided
              backgroundColor: button_color || (send_button_style && send_button_style.backgroundColor) || '#3b82f6',
              // Apply remaining styles from send_button_style (if any)
              ...(send_button_style || {})
            }}
            disabled={sendingMessage}
            onClick={handleClick}
          >
            <Send
              style={{
                width: '18px',
                height: '18px',
                stroke: button_text_color || (send_icon_style && send_icon_style.stroke) || '#FFFFFF',
                ...(send_icon_style || {})
              }}
              className={
                "cl-send-icon " +
                (!sendingMessage
                  ? "cl-notsending-message"
                  : "cl-sending-message")
              }
            />
          </button>
        </div>
      </div>
    </div>
  );
}
