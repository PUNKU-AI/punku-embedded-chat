# PUNKU.AI Embedded Chat

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/PUNKU-AI/punku-embedded-chat)

Welcome to the PUNKU.AI Embedded Chat repository! 🎉

The PUNKU.AI Embedded Chat is a powerful web component that enables seamless communication with the [PUNKU.AI app](https://app.punku.ai). This widget provides a chat interface, allowing you to integrate PUNKU.AI into your web applications effortlessly.

## Features

🌟 Seamless Integration: Easily integrate the Langflow Widget into your website or web application with just a few lines of JavaScript.

🚀 Interactive Chat Interface: Engage your users with a user-friendly chat interface, powered by PUNKU's advanced language understanding capabilities.

🎛️ Customizable Styling: Customize the appearance of the chat widget to match your application's design and branding.

🌐 Multilingual Support: Communicate with users in multiple languages, opening up your application to a global audience.

## Theme Options

The PUNKU.AI Chat Widget supports various visual themes to match your application's design. You can easily customize the appearance by adding the `theme` attribute to your widget.

### Available Themes

| Theme              | Description                                                           |
|--------------------|-----------------------------------------------------------------------|
| default            | Standard light theme with clean white background                      |
| dark               | Dark mode theme with dark backgrounds and light text                  |
| ocean              | Beautiful ocean background with translucent message bubbles           |
| aurora             | Northern lights inspired theme with colorful gradient backgrounds     |
| punku-ai-bookingkit| Same as default theme, but with "Powered by PUNKU.AI & bookingkit" branding |
| swarovski          | Crystal-inspired theme (Euclid Circular B font, sparkle trigger icon, German default) |

### How to Use Themes

Simply add the `theme` attribute to your chat widget:

```html
<punku-chat
  theme="ocean"
  host_url="your-punku-api-url"
  flow_id="your-flow-id"
></punku-chat>
```

### Custom Styling

You can still apply custom styling to themed widgets using the style properties:

```html
<punku-chat
  theme="dark"
  host_url="your-punku-api-url"
  flow_id="your-flow-id"
  chat_window_style='{"borderRadius":"16px"}'
></punku-chat>
```

Custom styles will be merged with the theme styles, allowing you to override specific properties while keeping the theme's overall look.

## Color Customization

The chat widget provides simple color properties for easy customization of the interface:

| Property | Type | Description |
|----------|------|-------------|
| button_color | string | Background color of the chat trigger button (hex code) |
| button_text_color | string | Text color of the chat trigger button (hex code) |
| background_color | string | Background color of the chat window (hex code) |
| bot_message_color | string | Background color of bot message bubbles (hex code) |
| bot_message_text_color | string | Text color of bot messages (hex code) |
| user_message_color | string | Background color of user message bubbles (hex code) |
| user_message_text_color | string | Text color of user messages (hex code) |
| link_color | string | Color of all hyperlinks in the chat (hex code) |

These simple properties make it easy for non-technical users to customize the appearance:

```html
<punku-chat
  button_color="#9A8747"
  button_text_color="#FFFFFF"
  background_color="#F9F6EA"
  bot_message_color="#EDEADD"
  bot_message_text_color="#333333"
  user_message_color="#9A8747"
  user_message_text_color="#FFFFFF"
  link_color="#0066CC"
  welcome_message="Hello! How can I help you today?"
></punku-chat>
```

### Link Color Customization

The `link_color` property allows you to customize the color of all hyperlinks that appear in the chat interface. This includes:
- Links in bot messages (e.g., URLs, references, resources)
- Links in the chat header (e.g., "Powered by PUNKU.AI" branding)
- Any clickable links throughout the chat interface

**Usage Example:**
```html
<punku-chat
  host_url="https://your-punku-instance.com"
  flow_id="your-flow-id"
  link_color="#FF5733"
></punku-chat>
```

**How it works:**
- Accepts any valid CSS color format (hex codes like `#FF5733`, RGB, color names)
- Applies to all link states: normal, hover, and visited
- Automatically adjusts opacity on hover for better user interaction
- Works seamlessly with all themes and custom color schemes

**Color recommendations:**
- Ensure sufficient contrast with the background for accessibility
- Use colors that complement your brand or theme
- Test visibility against both light and dark backgrounds if using multiple themes

For more advanced customization, you can still use the style properties:

```html
<punku-chat
  chat_trigger_style='{"backgroundColor":"#9A8747","color":"#FFFFFF"}'
  chat_window_style='{"backgroundColor":"#F9F6EA"}'
  bot_message_style='{"backgroundColor":"#EDEADD","color":"#333333"}'
  user_message_style='{"backgroundColor":"#9A8747","color":"#FFFFFF"}'
></punku-chat>
```

## Usage

### on simple HTML
```html
<html lang="en">
<head>
<script src="https://cdn.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat/dist/build/static/js/bundle.min.js"></script>
</head>
<body>
<punku-chat
    host_url="punku.ai url"
    flow_id="your_flow_id"
  ></punku-chat>
</body>
</html>
```

> **Note:** The widget is registered under two tag names: `<punku-chat>` (primary) and `<punku-chat-widget>` (alias). Both accept the same attributes.

### on React
 Import the js bundle in the index.html of your react project
```html
<script src="https://cdn.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat/dist/build/static/js/bundle.min.js"></script>
```
Encapsulate your custom element in a react component
```html
export default function ChatWidget() {
  return (
    <div>
<punku-chat
    host_url="punku.ai url"
    flow_id="your_flow_id"></punku-chat>
    </div>
  );
}
```

## Configuration

Use the widget API to customize your widget:

| Prop                  | Type      | Required |
|-----------------------|-----------|----------|
| api_key               | string    | No       |
| background_color      | string    | No       |
| bot_message_color     | string    | No       |
| bot_message_style     | json      | No       |
| bot_message_text_color| string    | No       |
| bottom_offset         | number    | No       |
| button_color          | string    | No       |
| button_text_color     | string    | No       |
| closed_widget_hint_auto_hide_ms | number | No   |
| closed_widget_hint_background_color | string | No |
| closed_widget_hint_position | string | No      |
| closed_widget_hint_text_color | string | No |
| closed_widget_hint_text | string  | No       |
| chat_position         | string    | No       |
| chat_trigger_style    | json      | No       |
| chat_window_style     | json      | No       |
| default_language      | string    | No       |
| output_type           | string    | No       |
| input_type            | string    | No       |
| output_component      | string    | No       |
| error_message_style   | json      | No       |
| flow_id               | string    | Yes      |
| header_icon           | string    | No       |
| header_icon_name      | string    | No       |
| height                | number    | No       |
| host_url              | string    | Yes      |
| idle_expiration_hours | number    | No       |
| input_container_style | json      | No       |
| input_style           | json      | No       |
| loading_messages      | json      | No       |
| online                | boolean   | No       |
| start_open            | boolean   | No       |
| online_message        | string    | No       |
| placeholder           | string    | No       |
| placeholder_sending   | string    | No       |
| send_button_style     | json      | No       |
| send_icon_style       | json      | No       |
| theme                 | string    | No       |
| top_offset            | number    | No       |
| trigger_icon          | string    | No       |
| ttl_hours             | number    | No       |
| tweaks                | json      | No       |
| user_message_color    | string    | No       |
| user_message_style    | json      | No       |
| user_message_text_color| string   | No       |
| welcome_message       | string    | No       |
| widget_id             | string    | No       |
| width                 | number    | No       |
| window_title          | string    | No       |
| session_id            | string    | No       |
| additional_headers    | json      | No       |
| show_feedback         | boolean   | No       |
| show_closed_widget_hint | boolean | No       |
| link_color            | string    | No       |

- **background_color:**
  - Type: String
  - Required: No
  - Description: Background color of the chat window (hex code).

- **bot_message_color:**
  - Type: String
  - Required: No
  - Description: Background color of bot message bubbles (hex code).

- **bot_message_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for formatting bot messages in the chat window.

- **bot_message_text_color:**
  - Type: String
  - Required: No
  - Description: Text color of bot messages (hex code).

- **button_color:**
  - Type: String
  - Required: No
  - Description: Background color of the chat trigger button (hex code).

- **button_text_color:**
  - Type: String
  - Required: No
  - Description: Text color of the chat trigger button (hex code).

- **input_type:**
  - Type: String
  - Required: No
  - Description: Specifies the input type for chat messages.

- **output_type:**
  - Type: String
  - Required: No
  - Description: Specifies the output type for chat messages.

- **output_component:**
  - Type: String
  - Required: No
  - Description: Specify the output ID for chat messages; this is necessary when multiple outputs are present.
 
- **chat_position:**
  - Type: String
  - Required: No
  - Description: Determines the position of the chat window (top-left, top-center, top-right, center-left, center-right, bottom-right, bottom-center, bottom-left).

- **chat_trigger_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for the chat trigger.

- **chat_window_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for the overall chat window.

- **default_language:**
  - Type: String
  - Required: No
  - Description: Sets the default language for the chat interface. Supported values are "en" (English) and "de" (German). If not specified, the widget automatically detects the browser's language preference. This affects all UI text including welcome messages, placeholders, and system messages.

- **error_message_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for error messages in the chat window.

- **flow_id:**
  - Type: String
  - Required: Yes
  - Description: Identifier for the flow associated with the component.

- **api_key:**
  - Type: String
  - Required: No
  - Description: API key sent as the `x-api-key` header on every request to the backend. Only set this when your PUNKU.AI deployment requires key-based authentication.

- **header_icon_name:**
  - Type: String
  - Required: No
  - Description: Name of a built-in [Lucide](https://lucide.dev/) icon to show in the chat header. Ignored if `header_icon` (a custom image URL) is provided; unknown names fall back to the default chat icon (`MessagesSquare`). Supported names: `Bell`, `BookOpen`, `Bot`, `Briefcase`, `Building2`, `Calendar`, `CalendarDays`, `Camera`, `Car`, `Clock`, `Coffee`, `Compass`, `CreditCard`, `Gift`, `Globe`, `GraduationCap`, `Headphones`, `Heart`, `HelpCircle`, `Home`, `Hotel`, `Info`, `Leaf`, `LifeBuoy`, `Mail`, `Map`, `MapPin`, `MessageCircle`, `MessageSquare`, `MessagesSquare`, `Mountain`, `MountainSnow`, `Music`, `Package`, `Phone`, `Plane`, `Search`, `Send`, `Settings`, `ShoppingBag`, `ShoppingCart`, `Smile`, `Snowflake`, `Sparkles`, `Star`, `Sun`, `Tag`, `Ticket`, `Truck`, `User`, `Users`, `Utensils`, `Wine`, `Zap`. To add another icon, import it and register it in `HEADER_ICONS` in `src/chatWidget/chatWindow/index.tsx`.

- **widget_id:**
  - Type: String
  - Required: No
  - Default: "punku-chat-widget"
  - Description: Identifier used to namespace the global control API exposed on `window` (`window['<widget_id>_api']`). Set a unique value when embedding more than one widget on the same page. See [PROGRAMMATIC_CONTROL.md](./PROGRAMMATIC_CONTROL.md).

- **loading_messages:**
  - Type: JSON
  - Required: No
  - Description: Array of strings shown (rotating) in the loading placeholder while a response is being generated. Overrides the built-in localized "thinking" messages.

- **ttl_hours:**
  - Type: Number
  - Required: No
  - Default: 24
  - Description: Absolute session lifetime in hours. After this many hours the stored conversation is discarded and a new session begins.

- **idle_expiration_hours:**
  - Type: Number
  - Required: No
  - Default: 0.5
  - Description: Idle session timeout in hours. If no message is sent within this window, the stored conversation expires.

- **bottom_offset:**
  - Type: Number
  - Required: No
  - Default: 20
  - Description: Vertical offset (in pixels) of the trigger/window from the bottom edge. Useful for clearing fixed footers or cookie banners.

- **top_offset:**
  - Type: Number
  - Required: No
  - Default: 60
  - Description: Top offset (in pixels) used for the full-screen mobile chat window so it clears fixed navbars.

- **height:**
  - Type: Number
  - Required: No
  - Description: Specifies the height of the chat window in pixels.

- **header_icon:**
  - Type: String
  - Required: No
  - Description: URL of a custom icon to display in the chat window header.

- **host_url:**
  - Type: String
  - Required: Yes
  - Description: The URL of the host for communication with the chat component.

- **input_container_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for the input container where chat messages are typed.

- **input_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for the chat input field.

- **Online:**
  - Type: Boolean
  - Required: No
  - Description: Indicates if the chat component is online or offline.

- **start_open:**
  - Type: Boolean
  - Required: No
  - Description: Indicates if the chat window should be open by default.

- **online_message:**
  - Type: String
  - Required: No
  - Description: Custom message to display when the chat component is online.

- **placeholder:**
  - Type: String
  - Required: No
  - Description: Placeholder text for the chat input field.

- **placeholder_sending:**
  - Type: String
  - Required: No
  - Description: Placeholder text to display while a message is being sent.

- **send_button_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for the send button in the chat window.

- **send_icon_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for the send icon in the chat window.

- **theme:**
  - Type: String
  - Required: No
  - Description: Specifies the visual theme for the chat widget. Options include "default", "dark", "ocean", "aurora", "punku-ai-bookingkit", and "swarovski".

- **trigger_icon:**
  - Type: String
  - Required: No
  - Description: URL of a custom icon to display on the floating chat trigger button instead of the default chat bubble icon. The close (X) icon is still shown while the chat window is open.

- **tweaks:**
  - Type: JSON
  - Required: No
  - Description: Additional custom tweaks for the associated flow.

- **user_message_color:**
  - Type: String
  - Required: No
  - Description: Background color of user message bubbles (hex code).

- **user_message_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for formatting user messages in the chat window.

- **user_message_text_color:**
  - Type: String
  - Required: No
  - Description: Text color of user messages (hex code).

- **welcome_message:**
  - Type: String
  - Required: No
  - Description: A customizable message that appears at the start of a conversation when no messages are present. This welcomes users and guides them on how to interact with the assistant.

- **closed_widget_hint_text:**
  - Type: String
  - Required: No
  - Default: "Hi, I am your AI assistant. How can I help you?"
  - Description: Text displayed next to the closed chat launcher, pointing at the widget trigger.

- **show_closed_widget_hint:**
  - Type: Boolean
  - Required: No
  - Default: false
  - Description: Controls whether the closed-widget hint is shown when the chat is closed.

- **closed_widget_hint_auto_hide_ms:**
  - Type: Number
  - Required: No
  - Description: Optional auto-hide timeout for the closed-widget hint in milliseconds. If omitted or set to 0/negative, the hint stays visible until the widget opens.

- **closed_widget_hint_position:**
  - Type: String
  - Required: No
  - Default: "left"
  - Description: Position of the closed-widget hint relative to the trigger. Supported values: "left", "top".

- **closed_widget_hint_background_color:**
  - Type: String
  - Required: No
  - Description: Background color of the closed-widget hint textbox (any valid CSS color value).

- **closed_widget_hint_text_color:**
  - Type: String
  - Required: No
  - Description: Text color of the closed-widget hint textbox (any valid CSS color value).

- **width:**
  - Type: Number
  - Required: No
  - Description: Specifies the width of the chat window in pixels.

- **window_title:**
  - Type: String
  - Required: No
  - Description: Title for the chat window, displayed in the header or title bar.

- **session_id:**
  - Type: String
  - Required: No
  - Description: Custom session id to override the random session id used as default.

- **additional_headers:**
  - Type: JSON
  - Required: No
  - Description: Additional headers to send with the API requests.

- **show_feedback:**
  - Type: Boolean
  - Required: No
  - Default: false
  - Description: Controls whether to display feedback buttons (thumbs up/down) for bot messages. When enabled, users can provide feedback on responses.

- **link_color:**
  - Type: String
  - Required: No
  - Description: Customizes the color of all hyperlinks throughout the chat interface (hex code or CSS color). This includes links in bot messages, header branding links, and any other clickable links. The color is applied to all link states (normal, hover, visited) with automatic hover opacity adjustment for better user interaction. Accepts any valid CSS color format including hex codes (e.g., "#0066CC"), RGB values, or color names.
