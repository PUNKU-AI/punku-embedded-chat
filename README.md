# PUNKU.AI Embedded Chat ⛓️

Welcome to the PUNKU.AI Embedded Chat repository! 🎉

The PUNKU.AI Embedded Chat is a powerful web component that enables seamless communication with the [PUNKU.AI app](https://app.punku.ai). This widget provides a chat interface, allowing you to integrate PUNKU.AI into your web applications effortlessly.

## Features

🌟 Seamless Integration: Easily integrate the Langflow Widget into your website or web application with just a few lines of JavaScript.

🚀 Interactive Chat Interface: Engage your users with a user-friendly chat interface, powered by PUNKU's advanced language understanding capabilities.

🎛️ Customizable Styling: Customize the appearance of the chat widget to match your application's design and branding.

🌐 Multilingual Support: Communicate with users in multiple languages, opening up your application to a global audience.

## Usage

### on simple HTML
```html
<html lang="en">
<head>
<script src="https://cdn.jsdelivr.net/gh/logspace-ai/langflow-embedded-chat@v1.0.6/dist/build/static/js/bundle.min.js"></script>
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
| bot_message_style     | json      | No       |
| chat_position         | string    | No       |
| chat_trigger_style    | json      | No       |
| chat_window_style     | json      | No       |
| output_type           | string    | No       |
| input_type            | string    | No       |
| output_component      | string    | No       |
| error_message_style   | json      | No       |
| flow_id               | string    | Yes      |
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
| tweaks                | json      | No       |
| user_message_style    | json      | No       |
| width                 | number    | No       |
| window_title          | string    | No       |
| session_id            | string    | No       |
| additional_headers    | json      | No       |

- **bot_message_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for formatting bot messages in the chat window.

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

- **tweaks:**
  - Type: JSON
  - Required: No
  - Description: Additional custom tweaks for the associated flow.

- **user_message_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for formatting user messages in the chat window.

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
  - Description: Additional headers to be sent to Langflow server
