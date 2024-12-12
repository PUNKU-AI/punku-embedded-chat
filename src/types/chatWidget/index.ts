export type ChatMessageType = {
    message: string;
    isSend: boolean;
    error?: boolean;
    bot_message_style?: React.CSSProperties;
    user_message_style?: React.CSSProperties;
    error_message_style?: React.CSSProperties;
    feedback?: string;
    message_id?: string;
  };


  export type ChatMessagePlaceholderType = {
    bot_message_style?: React.CSSProperties;
  };