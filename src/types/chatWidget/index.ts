import type { Language } from "../../translations";
import type { CheckoutCardData } from "../../chatWidget/checkoutCards";

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
    /** The checkout cards that the server sent with this answer (checkoutCards.ts). */
    checkoutCards?: CheckoutCardData[];
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