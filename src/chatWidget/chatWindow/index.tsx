import { ArrowUp, RefreshCw, Send, X } from "lucide-react";
import { extractMessageFromOutput, getAnimationOrigin, getChatPosition, trackVisualViewport, visualViewportInset } from "../utils";
import { useAnchorMetrics } from "../anchoredChatWindow";
import { getScaledFrameVisualViewport, ScaledPage, screenRules, viewportLength } from "../scaledPage";
import { phoneWindowDeclarations, phoneWindowStyle } from "../mobileChatWindowStyle";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatMessageType, LoadingMessages } from "../../types/chatWidget";
import ChatMessage from "./chatMessage";
import ChatInput from "./chatInput";
import LucideCdnIcon from "./lucideCdnIcon";
import { containScrollEvents } from "../scrollContainment";
import { guardControlColors } from "../controlColors";
import { markdownToPlainText } from "./plainText";
import { sendMessage, streamMessage } from "../../controllers";
import type { StreamTerminal } from "../../controllers";
import ChatMessagePlaceholder from "../../chatPlaceholder";
import PunkuLogo from "../../components/PunkuLogo";
import ConfirmationModal from "../components/ConfirmationModal";
import { translations, Language, Translation } from "../../translations";
import {
  createPunkuChatErrorDetail,
  dispatchPunkuChatError,
  getDefaultClientErrorReportUrl,
  PunkuChatErrorDetail,
  PunkuChatErrorPhase,
  reportPunkuChatError,
} from "../clientErrors";

// Same rationale as DEFAULT_MESSAGE_TEXT_STYLE: pin a readable input text size so
// it doesn't inherit a small host-page font through the closed shadow root. 16px
// also avoids iOS Safari's zoom-on-focus (triggered only below 16px). Spread first
// so a consumer's input_style can override it.
const DEFAULT_INPUT_TEXT_STYLE: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: 1.5,
};

/*
 * The visitor sees a plain sentence in the chat's language, never technical
 * text such as "HTTP error! status: 500, body: …" or a flow's own error text
 * (ERR_BACKEND_STREAM, for example "Error building Component …: 401"). The
 * technical detail still goes to console.error and to client-error reporting.
 */
const getRequestErrorMessage = (error: unknown, t: Translation) => {
  if (error && typeof error === "object") {
    const errorRecord = error as { code?: string; name?: string };

    if (errorRecord.code === "ERR_EMPTY_ASSISTANT_RESPONSE") {
      return t.errorEmpty;
    }

    if (errorRecord.code === "ERR_PREMATURE_STREAM_END") {
      return t.errorInterrupted;
    }

    // fetch() rejects with a TypeError when the network is down or blocked.
    if (errorRecord.code === "ERR_NETWORK" || errorRecord.name === "TypeError") {
      return t.errorNetwork;
    }
  }

  return t.errorServer;
};

const createStreamError = (message: string, code: string) =>
  Object.assign(new Error(message), { code });

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
  mobile_chat_window_style,
  error_message_style,
  placeholder_sending,
  send_button_style,
  online = true,
  open,
  online_message,
  branding,
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
  suggestions,
  show_feedback = false,
  header_icon,
  onHeaderIconError,
  header_icon_name,
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
  show_close_button_on_desktop = false,
  loading_messages,
  onClose,
  bottom_offset,
  top_offset = 60,
  left_offset = 20,
  right_offset = 20,
  positionOverrideStyle,
  scaledPage = null,
  programmaticMessage,
  onProgrammaticMessageHandled,
  widget_id = "punku-chat-widget",
  on_client_error,
  client_error_report_url,
  enable_client_error_reporting = true,
  onCheckout,
  removeLastMessage,
  ai_notice_text,
  show_ai_notice = true,
}: {
  api_key?: string;
  output_type: string,
  input_type: string,
  output_component?: string,
  bot_message_style?: React.CSSProperties;
  send_icon_style?: React.CSSProperties;
  user_message_style?: React.CSSProperties;
  chat_window_style?: React.CSSProperties;
  /** The place and size of the open window in the phone layout (mobileChatWindowStyle.ts). */
  mobile_chat_window_style?: React.CSSProperties;
  error_message_style?: React.CSSProperties;
  send_button_style?: React.CSSProperties;
  online?: boolean;
  open: boolean;
  onClose?: () => void;
  online_message?: string;
  branding?: "punku-ai" | "punku-ai-bookingkit";
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
  /** Up to four questions under the welcome message; a tap sends one. */
  suggestions?: string[];
  show_feedback?: boolean;
  header_icon?: string;
  onHeaderIconError?: () => void;
  header_icon_name?: string;
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
  show_close_button_on_desktop?: boolean;
  loading_messages?: LoadingMessages;
  bottom_offset?: number;
  top_offset?: number;
  left_offset?: number;
  right_offset?: number;
  positionOverrideStyle?: React.CSSProperties;
  /** A page that the browser scales up, such as Wix with width=320 (scaledPage.ts). */
  scaledPage?: ScaledPage | null;
  programmaticMessage?: { id: number; message: string } | null;
  onProgrammaticMessageHandled?: (id: number) => void;
  widget_id?: string;
  on_client_error?: (detail: PunkuChatErrorDetail) => void;
  client_error_report_url?: string;
  enable_client_error_reporting?: boolean;
  onCheckout?: (url: string, opener: HTMLAnchorElement) => boolean;
  /** Removes the newest message (the error that Try again replaces). */
  removeLastMessage?: () => void;
  /** Replaces the AI notice under the input (EU AI Act, Article 50). */
  ai_notice_text?: string;
  /** false hides the AI notice, for sites that show it elsewhere. */
  show_ai_notice?: boolean;
}) {
  const [value, setValue] = useState<string>("");
  // Use translations based on language prop
  const t = translations[language] || translations.en;
  const ref = useRef<HTMLDivElement>(null);
  const messagesContainer = useRef<HTMLDivElement>(null);
  const [windowPosition, setWindowPosition] = useState<{
    left: string;
    top: string;
    bottom?: string;
    right?: string;
  }>({ left: "0", top: "0" });
  const inputRef = useRef<HTMLTextAreaElement>(null); /* User input Ref */
  const chatWindowRef = useRef<HTMLDivElement>(null);
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

  /*
   * The phone styles size and place the window from the visible part of the
   * page, not from the layout viewport (#77). Set the box before the first
   * open frame, and follow it while the window is open. In the scaled page
   * frame, the visible part is the frame (getScaledFrameVisualViewport).
   */
  const inScaledFrame = Boolean(scaledPage);
  useLayoutEffect(() => {
    const chatWindow = chatWindowRef.current;
    if (!open || !chatWindow || inScaledFrame) return;
    return trackVisualViewport(chatWindow);
  }, [open, inScaledFrame]);
  // Viewport units measure the small page on a scaled page. See viewportLength.
  const vh = (percent: number) => viewportLength(percent, "vh", scaledPage);
  const vw = (percent: number) => viewportLength(percent, "vw", scaledPage);
  // The swarovski theme keeps the look of the swarovski-widget branch: links
  // on their own line stay text links, the send button is a paper plane, and
  // the phone window keeps its side margins (mobileChatWindowStyle.ts).
  const branchLook = theme === "swarovski";
  const linkButtons = !branchLook;
  const SendIcon = branchLook ? Send : ArrowUp;
  const sendIconSize = branchLook ? "18px" : "20px";
  const sendIconStroke = branchLook ? 2 : 2.5;
  // The phone window box: the defaults, or the theme's box and
  // mobile_chat_window_style (mobileChatWindowStyle.ts).
  const phoneWindowBox = useMemo(
    () => phoneWindowDeclarations(phoneWindowStyle(mobile_chat_window_style, theme), scaledPage)
      .join("\n              "),
    [mobile_chat_window_style, theme, scaledPage]
  );

  // Place the window from the visible corner. In Chrome on Android, the
  // layout viewport corner can be outside the screen (#77). The 641 px and
  // wider styles set --cl-window-gap, the gap above the visible bottom edge.
  const fixedWindowHorizontalStyle: React.CSSProperties = position?.endsWith("-left")
    ? { left: visualViewportInset("left", `${left_offset}px`), right: "auto" }
    : { left: "auto", right: visualViewportInset("right", `${right_offset}px`) };
  /*
   * Short landscape screens place the window beside the trigger, on its inner
   * side (#77). The gap uses the rendered trigger size.
   */
  const besideTriggerSide = position?.endsWith("-left") ? "left" : "right";
  const besideTriggerOffset = besideTriggerSide === "left" ? left_offset : right_offset;
  const { triggerSize } = useAnchorMetrics(open && !positionOverrideStyle, triggerRef);
  const besideTriggerInset = `calc(${besideTriggerOffset}px + ${triggerSize.width}px + 12px)`;
  const defaultWindowPositionStyle: React.CSSProperties = {
    bottom: visualViewportInset("bottom", "var(--cl-window-gap, calc(var(--cl-bottom-offset) + 80px))"),
    ...fixedWindowHorizontalStyle,
  };
  const effectiveWindowPositionStyle = positionOverrideStyle || defaultWindowPositionStyle;

  /* Initial listener for loss of focus that refocuses User input after a small delay */

  const [sendingMessage, setSendingMessage] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  // Screen readers hear "the assistant is writing", each complete answer and
  // each new error from one status region that is always in the window. A
  // region that appears together with its text is often not read, and messages
  // restored from the session must not be read again on each page load.
  const [statusAnnouncement, setStatusAnnouncement] = useState("");
  // Set when a send starts, before React renders sendingMessage: two
  // activations in one task (Enter twice, Try again twice) send only once.
  const sendingRef = useRef(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const handledProgrammaticMessageIds = useRef<Set<number>>(new Set());

  const notifyClientError = useCallback(
    (
      error: unknown,
      phase: PunkuChatErrorPhase,
      context?: Record<string, unknown>
    ) => {
      const detail = createPunkuChatErrorDetail({
        error,
        phase,
        widgetId: widget_id,
        flowId,
        hostUrl,
        sessionId: sessionId.current,
        context,
      });

      dispatchPunkuChatError(detail);
      on_client_error?.(detail);
      if (enable_client_error_reporting) {
        reportPunkuChatError(
          detail,
          client_error_report_url || getDefaultClientErrorReportUrl(hostUrl)
        );
      }
    },
    [
      client_error_report_url,
      enable_client_error_reporting,
      flowId,
      hostUrl,
      on_client_error,
      sessionId,
      widget_id,
    ]
  );

  const sendUserMessage = useCallback((message: string, options?: { retry?: boolean }): boolean => {
    if (!message || message.trim() === "" || sendingMessage || sendingRef.current) {
      return false;
    }

    // Check if session is still valid before sending message
    let sessionCleared = false;
    if (onSessionValidate && !onSessionValidate()) {
      // console.log('Session expired, clearing messages and starting new session');
      // Session expired, clear messages and start new session
      if (onStartNewSession) {
        onStartNewSession();
        sessionCleared = true;
      }
      // Note: Don't return here, continue with sending the message after session is cleared
    }

    // A retry sends the visitor's last message again; its bubble is already
    // there, unless an expired session just cleared the conversation.
    if (!options?.retry || sessionCleared) {
      addMessage({ message, isSend: true });
    }
    sendingRef.current = true;
    setSendingMessage(true);
    setStatusAnnouncement(t.typing);

    if (!enable_streaming) {
      sendMessage(hostUrl, flowId, message, input_type, output_type, sessionId, output_component, tweaks, api_key, additional_headers)
        .then((res) => {
          const answers: string[] = [];

          const addAssistantOutput = (output: any, messageId?: string) => {
            const assistantMessage = extractMessageFromOutput(output);
            if (typeof assistantMessage !== "string" || !assistantMessage.trim()) {
              return;
            }

            addMessage({
              message: assistantMessage,
              message_id: messageId,
              isSend: false,
            });
            answers.push(assistantMessage);
          };

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
                addAssistantOutput(output, output.id || output.component_id);
              })
            } else if (
              flowOutputs.length === 1
            ) {
              Object.values(flowOutputs[0].outputs).forEach((output: any) => {
                addAssistantOutput(output, flowOutputs[0].results.message.data.id);
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
                  addAssistantOutput(output);
                });
              });
            }
          }

          if (answers.length === 0) {
            throw createStreamError(
              "The assistant did not return a response. Please try again.",
              "ERR_EMPTY_ASSISTANT_RESPONSE"
            );
          }

          if (res.data && res.data.session_id) {
            sessionId.current = res.data.session_id;
          }
          sendingRef.current = false;
          setSendingMessage(false);
          setStatusAnnouncement(markdownToPlainText(answers.join("\n\n")));
        })
        .catch((err) => {
          const errorText = getRequestErrorMessage(err, t);
          addMessage({
            message: errorText,
            isSend: false,
            error: true,
          });
          setStatusAnnouncement(errorText);
          notifyClientError(err, "send-message", {
            inputType: input_type,
            outputType: output_type,
            outputComponent: output_component,
            messageLength: message.length,
            streaming: false,
          });
          console.error(err);
          sendingRef.current = false;
          setSendingMessage(false);
        });
    } else {
      // Streaming version
      let currentMessageId: string | null = null;
      let message_to_add = "";
      let streamErrorHandled = false;
      let terminalReceived = false;

      const emptyResponseError = () => createStreamError(
        "The assistant did not return a response. Please try again.",
        "ERR_EMPTY_ASSISTANT_RESPONSE"
      );

      const handleStreamError = (error: unknown) => {
        if (streamErrorHandled) {
          return;
        }

        streamErrorHandled = true;
        console.error('Streaming error:', error);
        sendingRef.current = false;
        setSendingMessage(false);
        setIsStreaming(false);

        const errorMessage = {
          message: getRequestErrorMessage(error, t),
          isSend: false,
          error: true,
        };
        setStatusAnnouncement(errorMessage.message);

        if (currentMessageId) {
          updateLastMessage({
            ...errorMessage,
            message_id: currentMessageId,
          });
        } else {
          addMessage(errorMessage);
        }

        notifyClientError(error, "stream-message", {
          inputType: input_type,
          outputType: output_type,
          outputComponent: output_component,
          messageLength: message.length,
          streaming: true,
        });
      };

      streamMessage(
        hostUrl,
        flowId,
        message,
        input_type,
        output_type,
        sessionId,
        output_component,
        tweaks,
        api_key,
        additional_headers,
        (data) => {
          // Handle streaming data as it arrives
          if (data.event === 'add_message' && data.data?.sender === "Machine") {
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
          } else if (data.event === "error") {
            terminalReceived = true;
            const detail = [
              data.data,
              data.data?.text,
              data.data?.message,
              data.data?.detail,
              data.message
            ].find((value) => typeof value === "string" && value.trim());
            handleStreamError(createStreamError(
              typeof detail === "string" && detail.trim()
                ? detail
                : t.errorServer,
              "ERR_BACKEND_STREAM"
            ));
          } else if (data.event === "end") {
            terminalReceived = true;

            // Final result - might contain session_id or final data
            if (data.data?.result?.session_id) {
              sessionId.current = data.data.result.session_id;
            }

            if (!message_to_add.trim()) {
              handleStreamError(emptyResponseError());
            }
          }
        },
        (terminal?: StreamTerminal) => {
          terminalReceived = terminalReceived || terminal === "end" || terminal === "done";

          if (streamErrorHandled) {
            return;
          }

          if (!terminalReceived) {
            handleStreamError(createStreamError(
              "The assistant response ended before it completed. Please try again.",
              "ERR_PREMATURE_STREAM_END"
            ));
            return;
          }

          if (!message_to_add.trim()) {
            handleStreamError(emptyResponseError());
            return;
          }

          // Stream ended
          // console.log('Stream completed');
          sendingRef.current = false;
          setSendingMessage(false);
          setIsStreaming(false);
          // Screen readers hear the complete answer once, not each token.
          setStatusAnnouncement(markdownToPlainText(message_to_add));

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
          handleStreamError(error);
        }
      ).catch((error) => {
        handleStreamError(error);
      });
    }
    return true;
  }, [
    additional_headers,
    addMessage,
    api_key,
    enable_streaming,
    flowId,
    hostUrl,
    input_type,
    notifyClientError,
    onSessionValidate,
    onStartNewSession,
    output_component,
    output_type,
    sendingMessage,
    sessionId,
    t,
    tweaks,
    updateLastMessage,
  ]);

  function handleClick() {
    // Shift+Enter can leave a trailing line break; send the text without
    // leading or trailing whitespace, as chat apps do.
    if (sendUserMessage(value.trim())) {
      setValue("");
    }
  }

  // Suggested questions under the welcome message: up to four, never empty.
  const suggestionList = Array.isArray(suggestions)
    ? suggestions
        .filter((suggestion): suggestion is string => typeof suggestion === "string" && suggestion.trim() !== "")
        .map((suggestion) => suggestion.trim())
        .slice(0, 4)
    : [];

  // The newest answer keeps its feedback buttons visible; older ones show
  // them on hover, on focus or after a vote.
  let latestAnswerIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!messages[index].isSend && !messages[index].error) {
      latestAnswerIndex = index;
      break;
    }
  }

  // Try again: remove the error message and send the visitor's last message again.
  const lastMessageIsError = messages.length > 0 && !!messages[messages.length - 1].error;
  const lastUserText = lastMessageIsError
    ? [...messages].reverse().find((message) => message.isSend)?.message
    : undefined;
  const handleRetry = typeof lastUserText === "string" && removeLastMessage
    ? () => {
        if (sendingMessage || sendingRef.current) return;
        removeLastMessage();
        sendUserMessage(lastUserText, { retry: true });
        // The focused button disappears: keep keyboard and screen-reader users
        // in the input. preventScroll: a plain focus() pans the host page (#69).
        inputRef.current?.focus({ preventScroll: true });
      }
    : undefined;

  useEffect(() => {
    if (!programmaticMessage) return;

    if (handledProgrammaticMessageIds.current.has(programmaticMessage.id)) {
      return;
    }

    if (!programmaticMessage.message.trim()) {
      handledProgrammaticMessageIds.current.add(programmaticMessage.id);
      onProgrammaticMessageHandled?.(programmaticMessage.id);
      return;
    }

    if (!open || sendingMessage) return;

    if (sendUserMessage(programmaticMessage.message)) {
      handledProgrammaticMessageIds.current.add(programmaticMessage.id);
      onProgrammaticMessageHandled?.(programmaticMessage.id);
    }
  }, [
    onProgrammaticMessageHandled,
    open,
    programmaticMessage,
    sendUserMessage,
    sendingMessage,
  ]);

  /*
   * Keep the newest message and streamed tokens in view, but only while the
   * visitor reads at the bottom. A visitor who scrolls up to read an earlier
   * answer stays there, and a button leads back to the newest message.
   * Scroll only the message list: scrollIntoView() also scrolls every
   * scrollable ancestor, including the visual viewport. On a phone page wider
   * than the screen that pans the visitor's view of the host page (#69).
   */
  const followNewest = useRef(true);
  const lastListScrollTop = useRef(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  useEffect(() => {
    const list = messagesContainer.current;
    if (!list) return;
    const handleScroll = () => {
      const distance = list.scrollHeight - list.clientHeight - list.scrollTop;
      // Only the visitor moves the list up; the widget's own scrolls go down.
      if (list.scrollTop < lastListScrollTop.current - 2 && distance > 8) {
        followNewest.current = false;
      }
      if (distance <= 80) {
        followNewest.current = true;
      }
      lastListScrollTop.current = list.scrollTop;
      setShowJumpToLatest(!followNewest.current && distance > 120);
    };
    list.addEventListener("scroll", handleScroll, { passive: true });
    return () => list.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const el = messagesContainer.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    // A scroll up counts even before its scroll event fires (one frame later):
    // the next streamed word must not pull the visitor back down.
    if (el.scrollTop < lastListScrollTop.current - 2 && el.scrollHeight - el.clientHeight - el.scrollTop > 8) {
      followNewest.current = false;
    }
    // The visitor's own new message always shows, and the answer follows it.
    if (last?.isSend) followNewest.current = true;
    if (followNewest.current) {
      // Pin a streamed answer at once. A smooth scroll per word keeps an
      // animation running that can override the visitor's own scroll.
      el.scrollTo({ top: el.scrollHeight, behavior: last?.streaming ? "auto" : "smooth" });
    } else {
      // The answer grows below a visitor who scrolled up. That fires no scroll
      // event, so check here whether the newest text is now far enough away.
      setShowJumpToLatest(el.scrollHeight - el.clientHeight - el.scrollTop > 120);
    }
  }, [messages]);

  const jumpToLatest = () => {
    const el = messagesContainer.current;
    followNewest.current = true;
    setShowJumpToLatest(false);
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  /*
   * Keep wheel/touch scrolling inside the message list instead of letting a
   * host-page smooth-scroll library (Lenis and friends) hijack it. The
   * composer applies the same rule; see scrollContainment.ts.
   */
  useEffect(() => containScrollEvents(messagesContainer.current), []);

  /*
   * Refocus the User input whenever a new response is returned from the LLM.
   * The input stays enabled while the assistant answers, and a streamed answer
   * changes the messages many times: wait until the answer is complete, so the
   * visitor can use a link or the host page in the meantime.
   * preventScroll: a plain focus() pans the host page like scrollIntoView() (#69).
   */

  /*
   * When the chat opens, the visitor wants to type: focus the input. After an
   * answer, never take focus from the host page, or from a link or button in
   * the messages: the visitor works there. On a touch screen, keep the
   * keyboard closed after an answer, so the visitor can read.
   */
  const wasOpen = useRef(false);
  const focusOnOpen = useRef(false);
  useEffect(() => {
    // A ref, not a local flag: a message change in the first 100 ms restarts
    // the timer, and the chat still focuses its input for the opening.
    if (open && !wasOpen.current) focusOnOpen.current = true;
    if (!open) focusOnOpen.current = false;
    wasOpen.current = open;
    if (!open || sendingMessage) return;
    const focusTimer = setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      const opening = focusOnOpen.current;
      focusOnOpen.current = false;
      if (!opening) {
        const root = input.getRootNode() as Document | ShadowRoot;
        const host = typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot ? root.host : null;
        const pageFocus = document.activeElement;
        const focusOnHostPage =
          !!pageFocus &&
          pageFocus !== document.body &&
          pageFocus !== document.documentElement &&
          pageFocus !== host &&
          !chatWindowRef.current?.contains(pageFocus);
        if (focusOnHostPage) return;
        const chatFocus = root.activeElement;
        if (chatFocus && chatFocus !== input && messagesContainer.current?.contains(chatFocus)) return;
        const touchScreen =
          typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
        if (touchScreen) return;
      }
      input.focus({ preventScroll: true });
    }, 100);
    return () => clearTimeout(focusTimer);
  }, [messages, open, sendingMessage]);

  /*
   * When the chat closes from inside (the close button, Escape), the focus
   * goes back to the launcher, so keyboard and screen-reader users keep their
   * place. A click on the host page keeps the focus where the visitor put it.
   */
  const wasOpenForFocus = useRef(open);
  useEffect(() => {
    const closed = wasOpenForFocus.current && !open;
    wasOpenForFocus.current = open;
    if (!closed) return;
    const chatWindow = chatWindowRef.current;
    const trigger = triggerRef?.current;
    if (!chatWindow || !trigger) return;
    const root = chatWindow.getRootNode() as Document | ShadowRoot;
    const focused = root.activeElement;
    if (focused && chatWindow.contains(focused)) {
      trigger.focus({ preventScroll: true });
    }
  }, [open, triggerRef]);

  /*
   * The composer grows with the text and takes that height from the message
   * list. When the list was scrolled to the bottom, keep it there, so the
   * newest message stays visible while the visitor types a long message.
   */
  const handleInputHeightChange = useCallback((delta: number) => {
    const list = messagesContainer.current;
    if (!list || delta <= 0) return;
    const distanceToBottom = list.scrollHeight - list.clientHeight - list.scrollTop;
    if (distanceToBottom <= delta + 2) {
      list.scrollTop = list.scrollHeight;
    } else if (!followNewest.current) {
      // A taller field makes the list shorter: the newest text moves away.
      setShowJumpToLatest(distanceToBottom > 120);
    }
  }, []);

  // Add theme-specific title modifications
  const displayTitle = window_title || t.windowTitle;

  // The header icons follow the header colour rule: button_text_color applies
  // only together with button_color. Otherwise the theme colours the header,
  // and a light button_text_color would hide the icons on a white header.
  const headerIconColor = button_color
    ? button_text_color || '#FFFFFF'
    : theme === "default" ? "#0f172a" : "white";

  // The bar under the messages holds the field and the AI notice. A fixed
  // height from input_container_style sizes the field, so the text never
  // leaves it. The other keys (background, border) style the bar.
  const {
    height: fieldHeight,
    minHeight: fieldMinHeight,
    maxHeight: fieldMaxHeight,
    ...inputBarStyle
  } = input_container_style || {};
  // The textarea is transparent, so input_style's background goes on the field.
  const composerFieldStyle: React.CSSProperties = {
    height: fieldHeight,
    minHeight: fieldMinHeight,
    maxHeight: fieldMaxHeight,
    ...(input_style?.backgroundColor ? { backgroundColor: input_style.backgroundColor } : {}),
  };

  // Determine welcome message
  const displayWelcomeMessage = welcome_message || t.welcomeMessage;

  // A site's colours can make a control vanish, for example a button in the
  // same red as the answer bubble, or blue links on dark red (1.6:1). The
  // guard keeps every colour that reads and replaces the others
  // (controlColors.ts). The style props are objects, so compare their contents.
  const colorStyles = JSON.stringify([bot_message_style, input_style, input_container_style, send_button_style, send_icon_style, error_message_style]);
  const guarded = useMemo(() => guardControlColors({
    theme, button_color, button_text_color, link_color, bot_message_color, bot_message_text_color,
    bot_message_style, background_color, input_style, input_container_style, send_button_style, send_icon_style,
    error_message_style,
  }).colors,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [theme, button_color, button_text_color, link_color, bot_message_color, bot_message_text_color, background_color, colorStyles]);
  const linkColor = link_color ? guarded.link || link_color : undefined;

  const effectiveBranding =
    branding === "punku-ai" ? "punku-ai" : "punku-ai-bookingkit";

  const brandingLinkStyle: React.CSSProperties = {
    color: "inherit",
    fontWeight: 700,
    textDecoration: "underline",
    cursor: "pointer"
  };

  const statusBranding = (
    <>
      Powered by{" "}
      <a
        href="https://www.punku.ai/?utm_source=customer_widget&utm_medium=referral&utm_campaign=powered_by"
        target="_blank"
        rel="noopener noreferrer nofollow"
        style={brandingLinkStyle}
      >
        PUNKU.AI
      </a>
      {effectiveBranding === "punku-ai-bookingkit" && (
        <>
          {" & "}
          <a
            href="https://bookingkit.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={brandingLinkStyle}
          >
            bookingkit
          </a>
        </>
      )}
    </>
  );

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
      // A new conversation starts with an empty field, not the old draft.
      setValue("");
    }
  };

  const handleCancelNewSession = () => {
    setShowConfirmModal(false);
  };


  return (
    <div
      ref={chatWindowRef}
      className={
        "cl-chat-window" +
        (open ? " cl-scale-100" : " cl-scale-0")
      }
      style={{
        "--cl-bottom-offset": `${Number(bottom_offset) || 20}px`,
        "--cl-top-offset": `${Number(top_offset) || 0}px`,
        ...(scaledPage ? getScaledFrameVisualViewport(scaledPage) : {}),
        position: "fixed",
        ...effectiveWindowPositionStyle,
        maxHeight: vh(70),
        maxWidth: vw(90),
        transform: "none !important", // Override any transforms with !important
        zIndex: positionOverrideStyle?.zIndex ?? 9999,
      } as React.CSSProperties}
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

          /* Always underline links in chat messages */
          .cl-window .cl-bot_message a,
          .cl-window .markdown-body a {
            text-decoration: underline !important;
          }

          /* The theme's link colour is hard to read on the site's own bubble
             colour. Links take the bubble's text colour and keep their
             underline. Filled link buttons have their own colours. */
          ${guarded.linksTakeTextColor ? `
          .cl-window .cl-bot_message .markdown-body a {
            color: ${guarded.link || "inherit"} !important;
          }
          ` : ''}

          /* Link color customization - scoped to chat messages only, not footer */
          ${linkColor ? `
          .cl-window .cl-bot_message a,
          .cl-window .markdown-body a {
            color: ${linkColor} !important;
          }
          /* No opacity on hover: it would take the link below 4.5:1. The
             stylesheet makes the underline solid instead. */
          .cl-window .cl-bot_message a:hover,
          .cl-window .markdown-body a:hover {
            color: ${linkColor} !important;
          }
          .cl-window .cl-bot_message a:visited,
          .cl-window .markdown-body a:visited {
            color: ${linkColor} !important;
          }
          ` : ''}

          /*
           * Responsive sizing for all screen sizes. On a scaled page,
           * screenRules picks the rules from the frame size (scaledPage.ts).
           */
          /* Mobile - Small phones */
          ${screenRules({ maxWidth: 640 }, `
            /*
             * Fit the visible part of the page (#77). trackVisualViewport sets
             * the variables. Without them, fill the layout viewport, as before.
             */
            .cl-chat-window {
              ${phoneWindowBox}
              padding-top: env(safe-area-inset-top, 0px);
              /* Follow the visible area at once. Animate only the open and close
                 (the fade and the rise). */
              transition-property: opacity, transform, visibility;
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

            /* One line of text is as tall as the 44px send button, so the
               text is centred next to it. input_style can still set the padding. */
            .cl-window .cl-composer-field .cl-input-element {
              padding-top: max(10px, 0.625rem);
              padding-bottom: max(10px, 0.625rem);
            }

            .cl-input-element {
              font-size: 16px !important; /* Prevents zoom on iOS */
            }

            /* Show close button on mobile */
            .cl-close-btn {
              display: flex !important;
            }
          `, scaledPage)}

          /*
           * 641 px and wider: keep the window inside the visible part of the
           * page, also above the on-screen keyboard (#77). Each layout sets
           * --cl-window-height. The window keeps the gap for the trigger while
           * 200 px, or its full height if less, fit above it. If not, it moves
           * down over the trigger, so that the header, the close X and the
           * send button stay on the screen. The X, Escape or a tap outside
           * then closes it.
           */
          ${screenRules({ minWidth: 641 }, `
            .cl-chat-window {
              --cl-visible-height: var(--cl-visual-viewport-height, ${vh(100)});
              --cl-trigger-gap: calc(var(--cl-bottom-offset) + 80px);
              --cl-window-room: max(
                calc(var(--cl-visible-height) - var(--cl-trigger-gap) - 8px),
                min(200px, var(--cl-window-height), calc(var(--cl-visible-height) - 16px))
              );
              --cl-window-gap: min(var(--cl-trigger-gap), calc(var(--cl-visible-height) - 8px - var(--cl-window-room)));
            }
          `, scaledPage)}

          /* Mobile landscape and small tablets */
          ${screenRules({ minWidth: 641, maxWidth: 767 }, `
            .cl-chat-window {
              /* An anchored window (setTriggerPosition) keeps the size that its placement used. */
              --cl-window-height: var(--cl-anchored-window-height, min(600px, ${vh(75)}));
              width: var(--cl-anchored-window-width, min(420px, ${vw(85)})) !important;
              height: var(--cl-window-height) !important;
              max-height: var(--cl-anchored-window-height, min(${vh(75)}, var(--cl-window-room))) !important;
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
          `, scaledPage)}

          /* Tablets */
          ${screenRules({ minWidth: 768, maxWidth: 1023 }, `
            .cl-chat-window {
              /* An anchored window (setTriggerPosition) keeps the size that its placement used. */
              --cl-window-height: var(--cl-anchored-window-height, min(600px, ${vh(70)}));
              width: var(--cl-anchored-window-width, min(420px, calc(${vw(60)} - 10px))) !important;
              height: var(--cl-window-height) !important;
              max-height: var(--cl-anchored-window-height, min(${vh(70)}, var(--cl-window-room))) !important;
            }

            /* The inline minWidth (the width prop, 450 px by default) would
               win over the 420 px box: the window covered the trigger on a
               phone in landscape and ran off an iPad in portrait. */
            .cl-window {
              width: 100% !important;
              height: 100% !important;
              min-width: unset !important;
            }

            /* Show close button on tablet */
            .cl-close-btn {
              display: flex !important;
            }
          `, scaledPage)}

          /*
           * Short landscape screens (#77): 641-1023 px wide, at most 500 px
           * tall. In the two layouts above, the window rose above the screen,
           * and a large bottom_offset left no room for it. Fill the visible
           * height beside the trigger instead. The window bottom stays level
           * with the trigger bottom while the window keeps 240 px (header,
           * one message line and input), or the visible height if less.
           * Else it moves down (--cl-window-gap of the 641 px rule). An
           * anchored window (setTriggerPosition) keeps its own place.
           */
          ${positionOverrideStyle ? '' : screenRules({ minWidth: 641, maxWidth: 1023, maxHeight: 500 }, `
            .cl-chat-window {
              --cl-trigger-gap: var(--cl-bottom-offset);
              --cl-window-room: max(
                calc(var(--cl-visible-height) - var(--cl-trigger-gap) - 8px),
                min(240px, calc(var(--cl-visible-height) - 16px))
              );
              top: ${visualViewportInset("top", "8px")} !important;
              bottom: ${visualViewportInset("bottom", "var(--cl-window-gap)")} !important;
              ${besideTriggerSide}: ${visualViewportInset(besideTriggerSide, besideTriggerInset)} !important;
              width: min(420px, ${vw(85)}, calc(var(--cl-visual-viewport-width, ${vw(100)}) - ${besideTriggerInset} - 8px)) !important;
              height: auto !important;
              max-height: none !important;
              /* Follow the visible area at once. Animate only the open and close
                 (the fade and the rise). */
              transition-property: opacity, transform, visibility;
            }
          `, scaledPage)}

          /* Desktop - standard sizes (1024px - 1440px) */
          ${screenRules({ minWidth: 1024, maxWidth: 1440 }, `
            .cl-chat-window {
              --cl-window-height: min(${height || 650}px, ${vh(70)});
              max-height: min(${vh(70)}, var(--cl-window-room)) !important;
              max-width: ${vw(90)} !important;
            }

            .cl-window {
              width: ${width || 450}px !important;
              height: ${height || 650}px !important;
              max-height: min(${vh(70)}, var(--cl-window-room)) !important;
            }
          `, scaledPage)}

          /* Large desktop displays */
          ${screenRules({ minWidth: 1441 }, `
            .cl-chat-window {
              --cl-window-height: min(${height || 700}px, ${vh(75)});
              max-height: min(${vh(75)}, var(--cl-window-room)) !important;
              max-width: ${vw(90)} !important;
            }

            .cl-window {
              width: min(${width || 500}px, ${vw(90)}) !important;
              height: min(${height || 700}px, ${vh(75)}) !important;
              max-height: min(${vh(75)}, var(--cl-window-room)) !important;
            }
          `, scaledPage)}

          /* Ensure message container scrolls properly at all sizes */
          .cl-messages_container {
            overflow-y: auto !important;
            overflow-x: hidden !important;
            overscroll-behavior: contain !important;
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
          ...(background_color ? {backgroundColor: background_color} : {}),
          // A site's button colour is the accent for link buttons in answers,
          // and its button text colour is the text on them.
          ...(button_color ? {"--cl-accent": button_color, "--cl-accent-hover": button_color, "--cl-on-accent": button_text_color || "#FFFFFF"} : {}),
          // Readable replacements where a colour would vanish (controlColors.ts).
          ...(guarded.linkButtonFill ? {"--cl-link-button-fill": guarded.linkButtonFill} : {}),
          ...(guarded.linkButtonLabel ? {"--cl-link-button-label": guarded.linkButtonLabel} : {}),
          ...(guarded.retryLabel ? {"--cl-retry-ink": guarded.retryLabel} : {}),
          ...(guarded.noticeInk ? {"--cl-notice-ink": guarded.noticeInk} : {}),
        } as React.CSSProperties}
        ref={ref}
        className={`cl-window ${theme ? `theme-${theme}` : ""} ${(button_color || background_color || bot_message_color || user_message_color || bot_message_style || user_message_style) ? "custom-theme" : ""}`}
      >
        {/* One row: the avatar, the title with the status under it, and the actions. */}
        <div
          className={"cl-header" + (button_color ? " cl-header--colored" : "")}
          style={button_color ? {backgroundColor: button_color, color: button_text_color || '#FFFFFF'} : undefined}
        >
          <div className="cl-header-content">
            {header_icon ? (
              <img
                src={header_icon}
                onError={onHeaderIconError}
                alt=""
                className="cl-header-logo cl-header-logo-image"
                width="38"
                height="38"
              />
            ) : (
              // The icon sits on the header. A plate carries it only where its
              // colour would vanish on the header (controlColors.ts).
              <div
                className={"cl-default-header-icon cl-header-avatar" + (guarded.headerIconPlate ? " cl-header-avatar--plate" : "")}
                style={guarded.headerIconPlate ? {backgroundColor: guarded.headerIconPlate} : undefined}
                aria-hidden="true"
              >
                <LucideCdnIcon
                  name={header_icon_name}
                  className="cl-header-logo"
                  color={headerIconColor}
                  size={24}
                />
              </div>
            )}
            <div className="cl-header-titles">
              <div className="cl-header-title">{displayTitle}</div>
              <div className="cl-header-subtitle" style={button_color ? {color: button_text_color || '#FFFFFF'} : undefined}>
                <span className={online ? "cl-online-message" : "cl-offline-message"} aria-hidden="true"></span>
                <span className="cl-header-status">
                  {online ? (online_message || statusBranding) : (offline_message || t.offlineMessage)}
                </span>
              </div>
            </div>
            <div className="cl-header-actions">
              {onStartNewSession && (
                <button
                  type="button"
                  onClick={handleNewSession}
                  className="cl-new-session-btn cl-header-btn"
                  title={t.newConversation}
                  aria-label={t.newConversation}
                >
                  <RefreshCw size={17} color={headerIconColor} aria-hidden="true" />
                </button>
              )}
              {/* Close button for phones and tablets; desktop shows it only with show_close_button_on_desktop */}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="cl-close-btn cl-header-btn"
                  title={t.closeChat}
                  aria-label={t.closeChat}
                  style={{ display: show_close_button_on_desktop ? 'flex' : 'none' }}
                >
                  <X size={20} color={headerIconColor} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* A named log of the conversation. The status region below reads new
            answers once, so the log itself does not announce changes. */}
        <div
          className="cl-messages_container"
          ref={messagesContainer}
          role="log"
          aria-live="off"
          aria-label={t.messageList}
          // Busy while an answer is on its way: the list is still changing.
          aria-busy={sendingMessage}
          style={background_color ? { backgroundColor: background_color } : undefined}
        >
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
              onClientError={notifyClientError}
              onCheckout={onCheckout}
              onFeedbackUpdate={undefined}
              linkButtons={linkButtons}
            />
          )}

          {/* Suggested questions before the conversation starts: a tap sends one. */}
          {messages.length === 0 && suggestionList.length > 0 && (
            <div
              className="cl-suggestions"
              role="group"
              aria-label={t.suggestions}
              // A site colour for the border only: as text, a light or dark
              // button_color could be unreadable on the chip background.
              style={{
                ...(button_color || guarded.chipLine ? {"--cl-chip-line": guarded.chipLine || button_color} : {}),
                ...(guarded.chipInk ? {"--cl-chip-ink": guarded.chipInk} : {}),
              } as React.CSSProperties}
            >
              {suggestionList.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="cl-suggestion"
                  disabled={sendingMessage}
                  onClick={() => sendUserMessage(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
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
              onClientError={notifyClientError}
              onCheckout={onCheckout}
              linkButtons={linkButtons}
              isLatest={index === latestAnswerIndex}
              onRetry={index === messages.length - 1 ? handleRetry : undefined}
              retryLabel={t.retry}
              helpfulLabel={t.helpful}
              notHelpfulLabel={t.notHelpful}
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
              loading_messages={loading_messages}
            />
          )}
          {/* Back to the newest message, for a visitor who scrolled up. The
              anchor has no height, so it never changes the scroll length. */}
          {showJumpToLatest && (
            <div className="cl-jump-latest-anchor">
              <button
                type="button"
                className="cl-jump-latest"
                onClick={jumpToLatest}
                aria-label={t.jumpToLatest}
                title={t.jumpToLatest}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14" />
                  <path d="m19 12-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <div className="cl-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {statusAnnouncement}
        </div>
        {/* input_container_style applies as set: button_color no longer replaces its background. */}
        <div style={inputBarStyle} className="cl-input_container">
          {/* A bordered field with the send button inside. */}
          <div className="cl-composer-field" style={composerFieldStyle}>
            <ChatInput
              ref={inputRef}
              value={value}
              onChange={setValue}
              onSend={handleClick}
              // The visitor can write the next message while the assistant answers;
              // it sends after the answer (the send button stays disabled until then).
              placeholder={sendingMessage && placeholder_sending ? placeholder_sending : (placeholder || t.placeholder)}
              ariaLabel={t.inputLabel}
              style={{
                ...DEFAULT_INPUT_TEXT_STYLE,
                ...(input_style || {}),
              }}
              onHeightChange={handleInputHeightChange}
              className="cl-input-element"
            />
            <button
              type="button"
              className="cl-send-button"
              aria-label={t.send}
              title={t.send}
              style={{
                // Base styles
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                margin: 0,
                cursor: 'pointer',
                // Only set button color if explicitly provided (otherwise CSS theme handles it)
                ...(button_color ? { backgroundColor: button_color } : (send_button_style?.backgroundColor ? { backgroundColor: send_button_style.backgroundColor } : {})),
                // Apply remaining styles from send_button_style (if any)
                ...(send_button_style || {}),
                // A fill that would vanish in the field gets a readable one (controlColors.ts).
                ...(guarded.sendFill ? { background: guarded.sendFill, backgroundColor: guarded.sendFill } : {})
              }}
              // Nothing to send: an empty field, or an answer still on its way.
              disabled={sendingMessage || !value.trim()}
              onClick={handleClick}
            >
              <SendIcon
                aria-hidden="true"
                strokeWidth={sendIconStroke}
                style={{
                  width: sendIconSize,
                  height: sendIconSize,
                  stroke: button_text_color || (send_icon_style && send_icon_style.stroke) || '#FFFFFF',
                  ...(send_icon_style || {}),
                  ...(guarded.sendIcon ? { stroke: guarded.sendIcon } : {})
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
          {/* EU AI Act, Article 50: visitors must know that they chat with an AI system. */}
          {show_ai_notice !== false && (
            <div className="cl-ai-notice">{ai_notice_text || t.aiNotice}</div>
          )}
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
          // The swarovski theme keeps the branch's red (#ef4444).
          buttonColor={button_color || (branchLook ? "#ef4444" : undefined)}
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
            border-top: 2px solid var(--cl-accent, #0969da);
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
