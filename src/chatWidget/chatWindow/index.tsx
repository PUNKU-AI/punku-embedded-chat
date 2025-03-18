import { Send } from "lucide-react";
import { extractMessageFromOutput, getAnimationOrigin, getChatPosition } from "../utils";
import React, { useEffect, useRef, useState } from "react";
import { ChatMessageType } from "../../types/chatWidget";
import ChatMessage from "./chatMessage";
import { sendMessage } from "../../controllers";
import ChatMessagePlaceholder from "../../chatPlaceholder";
import PunkuLogo from "../../components/PunkuLogo";

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
  online_message = "Powered by PUNKU.AI",
  offline_message = "Powered by PUNKU.AI",
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
  show_feedback = false
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

  // Add theme-specific title modifications
  const displayTitle = window_title;
  
  // Determine welcome message based on theme
  const defaultWelcomeMessage = "Hi there! How can I assist you today?";
  const displayWelcomeMessage = welcome_message || defaultWelcomeMessage;

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
      <div
        style={{ ...chat_window_style, width, height, minWidth: width }}
        ref={ref}
        className={`cl-window ${theme ? `theme-${theme}` : ""}`}
      >
        <div className="cl-header">
          <div className="cl-header-content">
            <svg 
              className="cl-header-logo" 
              width="24" 
              height="24" 
              viewBox="0 0 200 200" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path fillRule="evenodd" clipRule="evenodd" d="M100 200C155.228 200 200 155.228 200 100C200 44.7715 155.228 0 100 0C44.7715 0 0 44.7715 0 100C0 155.228 44.7715 200 100 200ZM100 180C144.183 180 180 144.183 180 100C180 55.8172 144.183 20 100 20C55.8172 20 20 55.8172 20 100C20 144.183 55.8172 180 100 180Z" fill="white"/>
              <path d="M136.464 63.5355C143.345 70.4168 143.345 81.5832 136.464 88.4645C129.583 95.3457 118.417 95.3457 111.536 88.4645C104.654 81.5832 104.654 70.4168 111.536 63.5355C118.417 56.6543 129.583 56.6543 136.464 63.5355Z" fill="white"/>
              <path d="M88.4645 111.536C95.3457 118.417 95.3457 129.583 88.4645 136.464C81.5832 143.345 70.4168 143.345 63.5355 136.464C56.6543 129.583 56.6543 118.417 63.5355 111.536C70.4168 104.654 81.5832 104.654 88.4645 111.536Z" fill="white"/>
              <path d="M63.5355 63.5355C70.4168 56.6543 81.5832 56.6543 88.4645 63.5355C95.3457 70.4168 95.3457 81.5832 88.4645 88.4645C81.5832 95.3457 70.4168 95.3457 63.5355 88.4645C56.6543 81.5832 56.6543 70.4168 63.5355 63.5355Z" fill="white"/>
              <path d="M136.464 111.536C143.345 118.417 143.345 129.583 136.464 136.464C129.583 143.345 118.417 143.345 111.536 136.464C104.654 129.583 104.654 118.417 111.536 111.536C118.417 104.654 129.583 104.654 136.464 111.536Z" fill="white"/>
            </svg>
            {displayTitle}
          </div>
          <div className="cl-header-subtitle">
            {online ? (
              <>
                <div className="cl-online-message"></div>
                {online_message}
              </>
            ) : (
              <>
                <div className="cl-offline-message"></div>
                {offline_message}
              </>
            )}
          </div>
        </div>
        
        <div className="cl-messages_container">
          {/* Welcome message - only show if there are no messages yet */}
          {messages.length === 0 && (
            <div className="cl-messages">
              <div className={`cl-message cl-bot-message theme-${theme}-message`}>
                <div className="cl-message-content">
                  <div className="cl-message-text">{displayWelcomeMessage}</div>
                </div>
              </div>
            </div>
          )}
          
          {messages.map((message, index) => (
            <ChatMessage
              bot_message_style={bot_message_style}
              user_message_style={user_message_style}
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
        <div style={input_container_style} className="cl-input_container">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleClick();
            }}
            type="text"
            disabled={sendingMessage}
            placeholder={sendingMessage ? (placeholder_sending || "Thinking...") : (placeholder || "Type your message...")}
            style={input_style}
            ref={inputRef}
            className="cl-input-element"
          />
          <button
            style={send_button_style}
            disabled={sendingMessage}
            onClick={handleClick}
          >
            <Send
              style={send_icon_style}
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
