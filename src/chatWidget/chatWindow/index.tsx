import { Send, MessagesSquare, RefreshCw, X } from "lucide-react";
import { extractMessageFromOutput, getAnimationOrigin, getChatPosition } from "../utils";
import React, { useEffect, useRef, useState } from "react";
import { ChatMessageType } from "../../types/chatWidget";
import ChatMessage from "./chatMessage";
import { sendMessage, streamMessage } from "../../controllers";
import ChatMessagePlaceholder from "../../chatPlaceholder";
import PunkuLogo from "../../components/PunkuLogo";
import ConfirmationModal from "../components/ConfirmationModal";
import { translations, Language } from "../../translations";

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
  header_icon,
  background_color,
  bot_message_color,
  user_message_color,
  button_color,
  button_text_color,
  bot_message_text_color,
  user_message_text_color,
  enable_streaming = true,
  onStartNewSession,
  onSessionValidate,
  isRefreshingSession = false,
  language = 'en' as Language,
  link_color,
  onClose,
  mobile_chat_window_style
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
  onClose?: () => void;
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
  theme?: "default" | "dark" | "ocean" | "aurora" | "punku-ai-bookingkit" | "swarovski";
  welcome_message?: string;
  show_feedback?: boolean;
  header_icon?: string;
  background_color?: string;
  bot_message_color?: string;
  user_message_color?: string;
  button_color?: string;
  button_text_color?: string;
  bot_message_text_color?: string;
  user_message_text_color?: string;
  enable_streaming?: boolean;
  onStartNewSession?: () => void;
  onSessionValidate?: () => boolean;
  isRefreshingSession?: boolean;
  language?: Language;
  link_color?: string;
  mobile_chat_window_style?: React.CSSProperties;
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
  const [isStreaming, setIsStreaming] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  function handleClick() {
    if (value && value.trim() !== "") {
      // Check if session is still valid before sending message
      if (onSessionValidate && !onSessionValidate()) {
        // console.log('Session expired, clearing messages and starting new session');
        // Session expired, clear messages and start new session
        if (onStartNewSession) {
          onStartNewSession();
        }
        // Note: Don't return here, continue with sending the message after session is cleared
      }

      addMessage({ message: value, isSend: true });
      setSendingMessage(true);
      setValue("");
  
      if (!enable_streaming) {
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
                    message_id: flowOutputs[0].results.message.data.id,
                    isSend: false,
                  });
                })
              } else {
                flowOutputs
                .sort((a, b) => {
                  const aTimestamp = Math.min(...Object.values(a.outputs).map((output: any) => Date.parse(output.message?.timestamp)));
                  const bTimestamp = Math.min(...Object.values(b.outputs).map((output: any) => Date.parse(output.message?.timestamp)));
                  return aTimestamp - bTimestamp;
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
      } else {
        // Streaming version
        let currentMessageId: string | null = null;
        let message_to_add = "";
        
        streamMessage(
          hostUrl, 
          flowId, 
          value, 
          input_type, 
          output_type, 
          sessionId, 
          output_component, 
          tweaks, 
          api_key, 
          additional_headers,
          (data) => {
            // Handle streaming data as it arrives
            if (data.event === 'add_message' && data.data.sender==="Machine") {
              // console.log('Data from :', data.data.sender);
              // console.log('Streaming text:', data.data.text);
              const new_message = data.data.text;
              if (new_message) {
                setIsStreaming(true);
                message_to_add = new_message;
                if (currentMessageId) {
                  updateLastMessage({
                    message: message_to_add,
                    message_id: currentMessageId,
                    isSend: false,
                    streaming: true
                  });
                } else {
                  currentMessageId = data.data.id;
                  addMessage({
                    message: message_to_add,
                    message_id: currentMessageId,
                    isSend: false,
                    streaming: true
                  });
                }
              }
            } else if (data.event === "end") {
              // Final result - might contain session_id or final data
              if (data.data.result.session_id) {
                sessionId.current = data.data.result.session_id;
              }
              
              // Mark message as complete (remove streaming flag)
              if (currentMessageId) {
                updateLastMessage({
                  message: message_to_add,
                  message_id: currentMessageId,
                  isSend: false,
                  streaming: false // Mark as complete
                });
              }
            }
          },
          () => {
            // Stream ended
            // console.log('Stream completed');
            setSendingMessage(false);
            setIsStreaming(false);
            
            // Ensure final message is marked as complete
            if (currentMessageId) {
              updateLastMessage({
                message: message_to_add,
                message_id: currentMessageId,
                isSend: false,
                streaming: false
              });
            }
          },
          (error) => {
            // Stream error
            console.error('Streaming error:', error);
            setSendingMessage(false);
            
            updateLastMessage({
              message: error.message || "Streaming error occurred",
              isSend: false,
              error: true,
            });
          }
        );
      }
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

  // Use translations based on language prop
  const t = translations[language] || translations.en;

  // Add theme-specific title modifications
  const displayTitle = window_title || t.windowTitle;

  // Determine welcome message
  const displayWelcomeMessage = welcome_message || t.welcomeMessage;

  // Handle new session with confirmation
  const handleNewSession = () => {
    if (onStartNewSession) {
      setShowConfirmModal(true);
    }
  };

  const handleConfirmNewSession = () => {
    setShowConfirmModal(false);
    if (onStartNewSession) {
      onStartNewSession();
    }
  };

  const handleCancelNewSession = () => {
    setShowConfirmModal(false);
  };


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
      {/* Relative positioning wrapper for modal overlay */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Custom style overrides for when custom colors are provided */}
      <style>
        {`
          /* Only apply background overrides when background_color is explicitly set */
          ${background_color ? `
          .cl-window.custom-theme {
            background-color: ${background_color} !important;
            background-image: none !important;
          }
          .cl-window.custom-theme * {
            background-image: none !important;
          }
          .cl-window.custom-theme .cl-messages_container {
            background-color: ${background_color} !important;
            background-image: none !important;
          }
          .cl-window.custom-theme .cl-input_container {
            background-color: ${background_color} !important;
            border-color: transparent !important;
          }
          ` : ''}

          /* Only apply bot message color overrides when explicitly set */
          ${bot_message_color || bot_message_text_color ? `
          .cl-window.custom-theme .cl-bot_message,
          .cl-window.custom-theme .cl-bot-message {
            ${bot_message_color ? `background-color: ${bot_message_color} !important;` : ''}
            ${bot_message_text_color ? `color: ${bot_message_text_color} !important;` : ''}
          }
          ` : ''}

          /* Only apply user message color overrides when explicitly set */
          ${user_message_color || user_message_text_color ? `
          .cl-window.custom-theme .cl-user_message {
            ${user_message_color ? `background-color: ${user_message_color} !important;` : ''}
            ${user_message_text_color ? `color: ${user_message_text_color} !important;` : ''}
          }
          ` : ''}

          /* Only apply header color overrides when button_color is explicitly set */
          ${button_color ? `
          .cl-window.custom-theme .cl-header {
            background-color: ${button_color} !important;
            color: ${button_text_color || '#FFFFFF'} !important;
          }
          ` : ''}

          /* Send button styling is handled inline */

          /* Link color customization - applies to all links in chat messages and header */
          ${link_color ? `
          .cl-window a {
            color: ${link_color} !important;
          }
          .cl-window a:hover {
            color: ${link_color} !important;
            opacity: 0.8;
          }
          .cl-window a:visited {
            color: ${link_color} !important;
          }
          ` : ''}

          /* Responsive sizing for all screen sizes */
          /* Mobile - Small phones */
          @media (max-width: 640px) {
            .cl-chat-window {
              width: ${mobile_chat_window_style?.width || 'calc(100vw - 16px)'} !important;
              height: ${mobile_chat_window_style?.height || 'calc(100vh - 120px)'} !important;
              max-height: ${mobile_chat_window_style?.maxHeight || mobile_chat_window_style?.height || 'calc(100vh - 120px)'} !important;
              right: ${mobile_chat_window_style?.right || '8px'} !important;
              bottom: ${mobile_chat_window_style?.bottom || '8px'} !important;
              left: ${mobile_chat_window_style?.left || '8px'} !important;
              ${mobile_chat_window_style?.top ? `top: ${mobile_chat_window_style.top} !important;` : ''}
            }

            .cl-window {
              width: 100% !important;
              height: 100% !important;
              max-height: 100% !important;
              min-width: unset !important;
            }

            /* Improve touch targets on mobile */
            .cl-send-button {
              width: 44px !important;
              height: 44px !important;
            }

            .cl-input-element {
              font-size: 16px !important; /* Prevents zoom on iOS */
            }

            /* Show close button on mobile */
            .cl-close-btn {
              display: flex !important;
            }
          }

          /* Mobile landscape and small tablets */
          @media (min-width: 641px) and (max-width: 767px) {
            .cl-chat-window {
              width: min(420px, 85vw) !important;
              height: min(600px, 75vh) !important;
              max-height: 75vh !important;
            }

            .cl-window {
              width: 100% !important;
              height: 100% !important;
              min-width: unset !important;
            }

            /* Show close button on mobile landscape */
            .cl-close-btn {
              display: flex !important;
            }
          }

          /* Tablets */
          @media (min-width: 768px) and (max-width: 1023px) {
            .cl-chat-window {
              width: min(420px, calc(60vw - 10px)) !important;
              height: min(600px, 70vh) !important;
              max-height: 70vh !important;
              right: 16px !important;
              left: auto !important;
            }

            .cl-window {
              width: 100% !important;
              height: 100% !important;
            }

            /* Show close button on tablet */
            .cl-close-btn {
              display: flex !important;
            }
          }

          /* Desktop - standard sizes (1024px - 1440px) */
          @media (min-width: 1024px) and (max-width: 1440px) {
            .cl-chat-window {
              max-height: 70vh !important;
              max-width: 90vw !important;
            }

            .cl-window {
              width: ${width || 450}px !important;
              height: ${height || 650}px !important;
              max-height: 70vh !important;
            }
          }

          /* Large desktop displays */
          @media (min-width: 1441px) {
            .cl-chat-window {
              max-height: 75vh !important;
              max-width: 90vw !important;
            }

            .cl-window {
              width: min(${width || 500}px, 90vw) !important;
              height: min(${height || 700}px, 75vh) !important;
              max-height: 75vh !important;
            }
          }

          /* Ensure message container scrolls properly at all sizes */
          .cl-messages_container {
            overflow-y: auto !important;
            overflow-x: hidden !important;
            flex: 1 !important;
          }

          /* Responsive improvements for animations */
          @media (prefers-reduced-motion: reduce) {
            .cl-chat-window {
              transition: none !important;
            }
          }
        `}
      </style>
      
      <div
        style={{ 
          ...chat_window_style, 
          width, 
          height, 
          minWidth: width,
          ...(background_color ? {backgroundColor: background_color} : {})
        }}
        ref={ref}
        className={`cl-window ${theme ? `theme-${theme}` : ""} ${(button_color || background_color || bot_message_color || user_message_color || bot_message_style || user_message_style) ? "custom-theme" : ""}`}
      >
        <div className="cl-header" style={button_color ? {backgroundColor: button_color, color: button_text_color || '#FFFFFF'} : undefined}>
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
            {onStartNewSession && (
              <button
                onClick={handleNewSession}
                className="cl-new-session-btn"
                title="Start new conversation"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: '8px',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <RefreshCw
                  size={16}
                  color={button_text_color || 'white'}
                />
              </button>
            )}
            {/* Close button for mobile and tablet */}
            {onClose && (
              <button
                onClick={onClose}
                className="cl-close-btn"
                title="Close chat"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'none', // Hidden by default, shown on mobile/tablet via CSS
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 'auto',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <X
                  size={20}
                  color={button_text_color || 'white'}
                />
              </button>
            )}
          </div>
          <div className="cl-header-subtitle" style={button_color ? {color: button_text_color || '#FFFFFF'} : undefined}>
            {online ? (
              <>
                <div className="cl-online-message"></div>
                {online_message ? (
                  online_message
                ) : theme === 'punku-ai-bookingkit' || theme === 'swarovski' ? (
                  <>
                    Powered by{' '}
                    <a
                      href="https://www.punku.ai/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: theme === 'swarovski' ? '#FFFFFF' : (link_color || 'inherit'),
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      PUNKU.AI
                    </a>
                    {' & '}
                    <a
                      href="https://bookingkit.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: theme === 'swarovski' ? '#FFFFFF' : (link_color || 'inherit'),
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      bookingkit
                    </a>
                  </>
                ) : (
                  <>
                    Powered by{' '}
                    <a
                      href="https://www.punku.ai/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: link_color || 'inherit',
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      PUNKU.AI
                    </a>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="cl-offline-message"></div>
                {offline_message || t.offlineMessage}
              </>
            )}
          </div>
        </div>
        
        <div className="cl-messages_container" style={background_color ? { backgroundColor: background_color } : undefined}>
          {/* Session refreshing loading message - show above everything */}
          {isRefreshingSession && (
            <div className="cl-session-refresh-message">
              <div className="cl-refresh-content">
                <div className="cl-refresh-spinner"></div>
                <span>Session refreshing...</span>
              </div>
            </div>
          )}

          {/* Welcome message - show below session refresh message when no messages yet */}
          {messages.length === 0 && (
            <ChatMessage
              message={displayWelcomeMessage}
              isSend={false}
              error={false}
              bot_message_style={
                bot_message_style ||
                (bot_message_color || bot_message_text_color ?
                  {
                    ...(bot_message_color ? {backgroundColor: bot_message_color} : {}),
                    ...(bot_message_text_color ? {color: bot_message_text_color} : {})
                  } : undefined)
              }
              user_message_style={undefined}
              error_message_style={error_message_style}
              message_id="welcome-message"
              feedback={undefined}
              api_key={api_key}
              additional_headers={additional_headers}
              host_url={hostUrl}
              onFeedbackUpdate={undefined}
            />
          )}

          {messages.map((message, index) => (
            <ChatMessage
              bot_message_style={
                bot_message_style || 
                (bot_message_color || bot_message_text_color ? 
                  {
                    ...(bot_message_color ? {backgroundColor: bot_message_color} : {}),
                    ...(bot_message_text_color ? {color: bot_message_text_color} : {})
                  } : undefined)
              }
              user_message_style={
                user_message_style || 
                (user_message_color || user_message_text_color ? 
                  {
                    ...(user_message_color ? {backgroundColor: user_message_color} : {}),
                    ...(user_message_text_color ? {color: user_message_text_color} : {})
                  } : undefined)
              }
              error_message_style={error_message_style}
              key={index}
              message_id={message.message_id}
              message={message.message}
              isSend={message.isSend}
              error={message.error}
              api_key={api_key}
              additional_headers={additional_headers}
              host_url={hostUrl}
            />
          ))}
          {sendingMessage && !isStreaming && (
            <ChatMessagePlaceholder
              bot_message_style={
                bot_message_style ||
                (bot_message_color || bot_message_text_color ?
                  {
                    ...(bot_message_color ? {backgroundColor: bot_message_color} : {}),
                    ...(bot_message_text_color ? {color: bot_message_text_color} : {})
                  } : undefined)
              }
              theme={theme}
              language={language}
            />
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

        {/* Confirmation Modal - positioned to cover entire widget */}
        <ConfirmationModal
          isOpen={showConfirmModal}
          onConfirm={handleConfirmNewSession}
          onCancel={handleCancelNewSession}
          title={t.newSessionTitle}
          message={t.newSessionConfirm}
          confirmText={t.confirmButton}
          cancelText={t.cancelButton}
          buttonColor={button_color}
          buttonTextColor={button_text_color}
        />

        <style>{`
          .cl-session-refresh-message {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 16px;
            margin: 8px 16px;
            background-color: #f3f4f6;
            border-radius: 8px;
            border: 1px solid #d1d5db;
          }

          .cl-refresh-content {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 14px;
            color: #6b7280;
            font-weight: 500;
          }

          .cl-refresh-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid #e5e7eb;
            border-top: 2px solid #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
