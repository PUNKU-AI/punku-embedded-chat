# Chat Widget Props Reference

## Required Props

| Prop | Type | Description |
|------|------|-------------|
| `host_url` | `string` | Backend API URL for the chat service |
| `flow_id` | `string` | Unique identifier for the chat flow |
| `input_type` | `string` | Message input type (default: `"chat"`) |
| `output_type` | `string` | Message output type (default: `"chat"`) |

## Appearance & Theming

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `theme` | `"default" \| "dark" \| "ocean" \| "aurora" \| "punku-ai-bookingkit" \| "swarovski"` | `"default"` | Visual theme preset |
| `height` | `number` | - | Chat window height |
| `width` | `number` | - | Chat window width |
| `chat_position` | `string` | - | Position of the chat widget on screen |
| `header_icon` | `string` | - | Custom icon URL for the chat header |
| `button_color` | `string` | - | Color of the trigger button |
| `button_text_color` | `string` | - | Text/icon color on the trigger button |
| `background_color` | `string` | - | Background color of the chat window |
| `link_color` | `string` | - | Color for hyperlinks in messages |

## Message Styling

| Prop | Type | Description |
|------|------|-------------|
| `bot_message_style` | `React.CSSProperties` | Custom styles for bot messages |
| `user_message_style` | `React.CSSProperties` | Custom styles for user messages |
| `error_message_style` | `React.CSSProperties` | Custom styles for error messages |
| `bot_message_color` | `string` | Background color for bot messages |
| `user_message_color` | `string` | Background color for user messages |
| `bot_message_text_color` | `string` | Text color for bot messages |
| `user_message_text_color` | `string` | Text color for user messages |

## Input & UI Styling

| Prop | Type | Description |
|------|------|-------------|
| `chat_trigger_style` | `React.CSSProperties` | Custom styles for the floating trigger button |
| `chat_window_style` | `React.CSSProperties` | Custom styles for the chat window container |
| `mobile_chat_window_style` | `React.CSSProperties` | Custom styles for the chat window on mobile (max-width: 640px). Supports `width`, `height`, `maxHeight`, `top`, `right`, `bottom`, `left` |
| `send_icon_style` | `React.CSSProperties` | Custom styles for the send button icon |
| `send_button_style` | `React.CSSProperties` | Custom styles for the send button |
| `input_style` | `React.CSSProperties` | Custom styles for the text input field |
| `input_container_style` | `React.CSSProperties` | Custom styles for the input container |

## Text & Localization

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `window_title` | `string` | - | Title displayed in the chat header |
| `placeholder` | `string` | - | Placeholder text for the input field |
| `placeholder_sending` | `string` | - | Placeholder text shown while sending |
| `welcome_message` | `string` | - | Initial message displayed when chat opens |
| `online_message` | `string` | - | Status message when bot is online |
| `offline_message` | `string` | - | Status message when bot is offline |
| `default_language` | `string` | - | Default UI language (`"en"`, `"de"`, etc.) |

## Behavior

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `start_open` | `boolean` | `false` | Open widget automatically on page load |
| `online` | `boolean` | - | Override online/offline status |
| `show_feedback` | `boolean` | `false` | Enable thumbs up/down feedback on messages |

## Session Management

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `session_id` | `string` | auto-generated | Override the session ID |
| `widget_id` | `string` | `"punku-chat-widget"` | Unique ID for the widget instance (used for global API access) |
| `ttl_hours` | `number` | 24 | Absolute session expiration time in hours |
| `idle_expiration_hours` | `number` | 0.5 (30 min) | Session expires after this many hours of inactivity |

## API Configuration

| Prop | Type | Description |
|------|------|-------------|
| `api_key` | `string` | API key for authentication |
| `tweaks` | `{ [key: string]: any }` | Custom tweaks passed to the flow |
| `additional_headers` | `{ [key: string]: string }` | Extra HTTP headers for API requests |
| `output_component` | `string` | Specific component to get output from |
