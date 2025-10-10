# PUNKU.AI Embedded Chat ⛓️

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
  welcome_message="Hello! How can I help you today?"
></punku-chat>
```

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
| background_color      | string    | No       |
| bot_message_color     | string    | No       |
| bot_message_style     | json      | No       |
| bot_message_text_color| string    | No       |
| button_color          | string    | No       |
| button_text_color     | string    | No       |
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
| height                | number    | No       |
| host_url              | string    | Yes      |
| input_container_style | json      | No       |
| input_style           | json      | No       |
| online                | boolean   | No       |
| start_open            | boolean   | No       |
| online_message        | string    | No       |
| placeholder           | string    | No       |
| placeholder_sending   | string    | No       |
| send_button_style     | json      | No       |
| send_icon_style       | json      | No       |
| theme                 | string    | No       |
| tweaks                | json      | No       |
| user_message_color    | string    | No       |
| user_message_style    | json      | No       |
| user_message_text_color| string   | No       |
| welcome_message       | string    | No       |
| width                 | number    | No       |
| window_title          | string    | No       |
| session_id            | string    | No       |
| additional_headers    | json      | No       |
| show_feedback         | boolean   | No       |

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
  - Description: Specifies the visual theme for the chat widget. Options include "default", "dark", "ocean", "aurora", and "punku-ai-bookingkit".

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
