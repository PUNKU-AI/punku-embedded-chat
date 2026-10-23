import type { Language } from "../../translations";

export type ChatMessageType = {
    message: string;
    isSend: boolean;
    error?: boolean;
    bot_message_style?: React.CSSProperties;
    user_message_style?: React.CSSProperties;
    error_message_style?: React.CSSProperties;
    feedback?: string;
    message_id?: string;
    streaming?: boolean;
  };


  /**
   * Thinking texts: one list, or lists per language ("en", "it-IT", ...) with
   * "default" for the other languages.
   */
  export type LoadingMessages = string[] | { [language: string]: string[] | undefined };

  export type ChatMessagePlaceholderType = {
    bot_message_style?: React.CSSProperties;
    theme?: "default" | "dark" | "ocean" | "aurora" | "punku-ai-bookingkit" | "swarovski";
    language?: Language;
    loading_messages?: LoadingMessages;
  };