# PUNKU.AI Embedded Chat

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/PUNKU-AI/punku-embedded-chat)

Welcome to the PUNKU.AI Embedded Chat repository! 🎉

The PUNKU.AI Embedded Chat is a powerful web component that enables seamless communication with the [PUNKU.AI app](https://app.punku.ai). This widget provides a chat interface, allowing you to integrate PUNKU.AI into your web applications effortlessly.

## Development

Use Node.js 24. Run `nvm use` to select the version in `.nvmrc`.

```sh
npm ci
npm run audit:dependencies
npm test
npm run build:release
npm start
```

The build writes `dist/build/static/js/bundle.min.js` and its license file.
Webpack builds the widget directly. Babel handles TypeScript and JSX.
Jest runs with two workers. The release build uses one worker and a 2 GB memory limit.
Check for other test jobs before running these commands on a shared machine.
The legacy `build:react` and `build:bundle` commands both run the complete release build.
`npm start` serves the test harness at `http://127.0.0.1:3000`.
It rebuilds changes in a temporary directory and keeps the committed release files intact.
Refresh the browser after each development build.

## Features

🌟 Seamless Integration: Easily integrate the PUNKU.AI chat widget into your website or web application with just a few lines of JavaScript.

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
| swarovski          | Crystalline theme with its own fonts, loader, and German default language |
| punku-ai-bookingkit| Legacy bookingkit-branded theme name; prefer `theme="default"` with `branding="punku-ai-bookingkit"` |

### How to Use Themes

Simply add the `theme` attribute to your chat widget:

```html
<punku-chat
  theme="ocean"
  flow_id="your-flow-id"
></punku-chat>
```

### Custom Styling

You can still apply custom styling to themed widgets using the style properties:

```html
<punku-chat
  theme="dark"
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

The `link_color` property allows you to customize the color of hyperlinks in chat messages and markdown content. This includes:
- Links in bot messages (e.g., URLs, references, resources)
- Markdown links in generated content

**Usage Example:**
```html
<punku-chat
  flow_id="your-flow-id"
  link_color="#FF5733"
></punku-chat>
```

**How it works:**
- Accepts any valid CSS color format (hex codes like `#FF5733`, RGB, color names)
- Applies to all link states: normal, hover, and visited
- Automatically adjusts opacity on hover for better user interaction
- Works seamlessly with all themes and custom color schemes

**Link buttons:** a link that stands alone on its own line in an answer is an action, so the widget shows it as a button with an arrow:
- A link alone in a paragraph is a filled button in the accent colour. With `button_color`, the button uses `button_color` and `button_text_color`.
- Links alone in list items are outlined buttons in the link colour, stacked without bullets. This also applies to a list with blank lines between its items.
- A link inside a sentence stays a normal link with a light underline. Without `link_color`, each theme uses a link colour that is readable on its answer bubbles.
- With your own answer colour (`bot_message_color`, or a background in `bot_message_style`) and no `link_color`, the widget checks the theme's link colour on your colour. Below 4.5:1 (WCAG AA), links and outlined link buttons take the answer's text colour and keep their underline. They do the same when the widget cannot read your colour, for example a gradient or a colour with transparency.

**Readable controls on your colours:** your colours can make a control vanish, for example a filled link button in the same colour as the answer bubble. The widget checks every control on the surface behind it (WCAG 1.4.11 and 1.4.3) and keeps every colour that reads:
- A filled link button, a suggestion chip and the send button need 3:1 against the bubble, the message list or the input field. Their text needs 4.5:1, the send icon 3:1.
- If a fill or an outline falls below 3:1, the widget uses your `link_color` if that reaches 3:1. Else it moves your colour just enough to be readable, as long as its text still reads. Else it uses white or black. For a theme colour it uses the theme's link colour, else white or black.
- The text on the new fill keeps its colour if it reads. Else it takes the surface colour (for example dark red text on a gold button in a dark red bubble), else white or black.
- Link text needs 4.5:1 on the answer bubble. Your `link_color` stays if it reaches that. Below that, the widget makes it just dark or light enough.
- Without `link_color`, links use the theme's link colour if it reaches 4.5:1. Else they take the answer text colour. If that text colour also falls below 4.5:1, links take a dark or light shade of the bubble colour.
- The AI notice under the input field needs 4.5:1 on the input bar (`background_color` or `input_container_style`). Below that, its grey becomes just dark or light enough.
- The closed hint text needs 4.5:1 on the hint. Your own colours win over the widget's: with only `closed_widget_hint_background_color`, the text turns white or black; with only `closed_widget_hint_text_color`, the hint turns dark. With both, the widget makes your background just dark or light enough for your text, else the text takes white or black.
- "Try again" in an error message takes white or black if the error text colour falls below 4.5:1.
- Gradients and colour names cannot be measured: those controls stay as they are.

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

### Bookingkit checkout

Bookingkit cart links with `utm_source=web_chat` open checkout on the same page.
The widget uses the installed Bookingkit modal when its checkout API has a visible host.
Otherwise, it opens checkout in a native dialog with a Bookingkit iframe.
This also handles checkout clicks when NitroPack cancels normal link navigation.

The handler accepts only `https://eu5.bookingkit.de/cart/set/<32-character vendor ID>` links.
It preserves the complete cart URL and all attribution parameters.
Other links, middle clicks, and modifier clicks keep their normal browser behavior.
The dialog includes a close button and an explicit link to open checkout in a new tab.
Browsers without native dialog support keep the normal checkout link.

### on simple HTML
```html
<html lang="en">
<head>
<script src="https://cdn.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat/dist/build/static/js/bundle.min.js"></script>
</head>
<body>
<punku-chat
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
      <punku-chat flow_id="your_flow_id"></punku-chat>
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
| button_color          | string    | No       |
| button_text_color     | string    | No       |
| closed_widget_hint_auto_hide_ms | number | No   |
| closed_widget_hint_background_color | string | No |
| closed_widget_hint_position | string | No      |
| closed_widget_hint_show_once | boolean | No     |
| closed_widget_hint_text_color | string | No |
| closed_widget_hint_text | string  | No       |
| chat_position         | string    | No       |
| chat_trigger_style    | json      | No       |
| chat_window_style     | json      | No       |
| client_error_report_url | string  | No       |
| default_language      | string    | No       |
| enable_client_error_reporting | boolean | No |
| enable_trigger_relocation | boolean | No |
| output_type           | string    | No       |
| input_type            | string    | No       |
| output_component      | string    | No       |
| error_message_style   | json      | No       |
| flow_id               | string    | Yes      |
| branding              | string    | No       |
| header_icon           | string    | No       |
| header_icon_name      | string    | No       |
| height                | number    | No       |
| host_url              | string    | No       |
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
| trigger_icon          | string    | No       |
| tweaks                | json      | No       |
| user_message_color    | string    | No       |
| user_message_style    | json      | No       |
| user_message_text_color| string   | No       |
| welcome_message       | string    | No       |
| suggestions           | json      | No       |
| width                 | number    | No       |
| window_title          | string    | No       |
| session_id            | string    | No       |
| ttl_hours             | number    | No       |
| widget_id             | string    | No       |
| bottom_offset         | number    | No       |
| top_offset            | number    | No       |
| left_offset           | number    | No       |
| right_offset          | number    | No       |
| additional_headers    | json      | No       |
| ai_notice_text        | string    | No       |
| show_ai_notice        | boolean   | No       |
| show_feedback         | boolean   | No       |
| show_closed_widget_hint | boolean | No       |
| show_close_button_on_desktop | boolean | No |
| link_color            | string    | No       |
| z_index               | number    | No       |

- **ai_notice_text:**
  - Type: String
  - Required: No
  - Description: Your own wording for the line under the input that tells visitors they are chatting with an AI system (EU AI Act, Article 50). Default: the built-in notice in the chat's language, for example "You are chatting with an AI assistant." or, in German, "Sie chatten mit einem KI-Assistenten."

- **show_ai_notice:**
  - Type: Boolean
  - Required: No
  - Default: `true`
  - Description: `false` hides the AI notice under the input. Use it only when your page tells visitors in another way that they chat with an AI system.

- **api_key:**
  - Type: String
  - Required: No
  - Description: API key for the flow. The widget sends it in the `x-api-key` request header. Every visitor can read this value in the page source. Use only a key that is safe to publish.

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
  - Description: Sets the language of the built-in texts: the default welcome message and placeholder, the AI notice, error messages, "Try again", the thinking phrases and the screen-reader labels. Supported values: `en` (English), `de` (German), `it` (Italian), `es` (Spanish), `pt` (Portuguese), `fr` (French) and `pl` (Polish). A region tag such as `it-IT` also works. Your own texts (`welcome_message`, `placeholder`, `loading_messages`, `ai_notice_text`) always show as you wrote them.
  - Without `default_language`, the widget takes:
    1. the page language (`<html lang>`), if the widget has that language,
    2. else the first browser language that the widget has,
    3. else English.

    The `swarovski` theme is German unless `default_language` is set. If the page changes `<html lang>` later, for example with a language switch, the chat follows.

- **error_message_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for error messages in the chat window, for example `backgroundColor`, `color` and `borderColor`. If you set this prop, the error box starts from the classic look (red `#f87171` background, white text), and your values apply on top. Without it, the box has a soft red look with dark variants for the dark themes. The Try again button uses the text colour. See [Thinking and error states](#thinking-and-error-states).

- **flow_id:**
  - Type: String
  - Required: Yes
  - Description: Identifier for the flow associated with the component. The widget reads it when it mounts. To change it, replace the element.

- **height:**
  - Type: Number
  - Required: No
  - Description: Specifies the height of the chat window in pixels.

- **header_icon:**
  - Type: String
  - Required: No
  - Description: URL of a custom icon to display in the chat window header.

- **header_icon_name:**
  - Type: String
  - Required: No
  - Default: `MessagesSquare`
  - Description: Name of a [Lucide](https://lucide.dev/icons/) icon for the chat window header, in PascalCase (for example `MessageCircle`). An unknown name falls back to the default icon. If `header_icon` is also set, `header_icon` wins.

- **host_url:**
  - Type: String
  - Required: No
  - Default: `https://app.punku.ai`
  - Description: The URL of the host for communication with the chat component. Override this only when using a custom PUNKU instance.

- **idle_expiration_hours:**
  - Type: Number
  - Required: No
  - Default: 0.5 (30 minutes)
  - Description: The stored session expires after this many hours without activity. The next message then starts a new session. `0` turns off the idle limit.

- **input_container_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for the bar under the messages. It holds the input field (a bordered field with the send button inside) and the AI notice. `height`, `minHeight` and `maxHeight` size the input field, not the whole bar. With a fixed `height`, the text stays inside the field and scrolls there. The other keys, for example `backgroundColor` and `borderTop`, style the bar. `backgroundColor` applies also when `button_color` is set.

- **input_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for the chat input field. The field is a textarea that grows with the text up to six lines and then scrolls inside itself. Enter sends the message and Shift+Enter inserts a line break; the visitor's bubble keeps those line breaks. `fontSize`, `lineHeight`, `padding` and `maxHeight` are honoured. A fixed `height` is ignored, because the widget sets the height from the text. `backgroundColor` colours the whole field around the text and the send button.

- **loading_messages:**
  - Type: JSON
  - Required: No
  - Description: Array of strings that the widget shows in turn next to the typing dots while it waits for a reply, for example `'["One moment…","Checking the details…"]'`. Empty strings are ignored. If the array is empty or omitted, the widget shows its built-in phrases in the chat's language (see `default_language`). The `swarovski` theme shows its crystal phrases.

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
  - Description: Custom text-only message to display when the chat component is online. Use `branding` for linked built-in PUNKU.AI and bookingkit variants.

- **branding:**
  - Type: String
  - Required: No
  - Default: `punku-ai-bookingkit`
  - Options: `punku-ai-bookingkit`, `punku-ai`
  - Description: Controls the linked online status branding. `punku-ai-bookingkit` renders "Powered by PUNKU.AI & bookingkit" with both links. `punku-ai` renders "Powered by PUNKU.AI" with the PUNKU.AI link.

- **placeholder:**
  - Type: String
  - Required: No
  - Description: Placeholder text for the chat input field.

- **placeholder_sending:**
  - Type: String
  - Required: No
  - Description: Placeholder text of the input field while the assistant answers. Without it, the field keeps its normal `placeholder`. The field stays enabled, so the visitor can write the next message. It does not change the thinking bubble; use `loading_messages` for that.

- **send_button_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for the round send button inside the input field. The button is dimmed while the field is empty or while the assistant answers. Screen readers announce it as "Send message".

- **send_icon_style:**
  - Type: JSON
  - Required: No
  - Description: Styling options for the arrow-up send icon.

- **theme:**
  - Type: String
  - Required: No
  - Description: Specifies the visual theme for the chat widget. Options include "default", "dark", "ocean", "aurora", "swarovski", and "punku-ai-bookingkit".

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

- **suggestions:**
  - Type: JSON
  - Required: No
  - Description: Up to four questions that show as buttons under the welcome message, for example `'["Opening hours","Tickets for families","Wheelchair access"]'`. A tap sends the question. The buttons show only before the conversation starts. Empty strings are ignored, and more than four are cut to four. With `button_color`, the buttons take that colour as their border. Their text keeps the theme colour, so it stays readable.

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

- **show_close_button_on_desktop:**
  - Type: Boolean
  - Required: No
  - Default: false
  - Description: Controls whether the chat window header close button is shown on desktop screens. If omitted or false, the close button keeps the default behavior and only appears on mobile/tablet.

- **closed_widget_hint_auto_hide_ms:**
  - Type: Number
  - Required: No
  - Description: Optional auto-hide timeout for the closed-widget hint in milliseconds. If omitted or set to 0/negative, the hint stays visible until the widget opens.

- **closed_widget_hint_show_once:**
  - Type: Boolean
  - Required: No
  - Default: true
  - Description: Shows the closed-widget hint only once per browsing session (tracked in sessionStorage per domain and flow). The hint does not reappear on subpage navigation or after the visitor closes the chat window. It appears again when the visitor opens the site in a new tab or browser session. Set to false to show the hint on every page load (previous behavior).

- **closed_widget_hint_position:**
  - Type: String
  - Required: No
  - Default: "left"
  - Description: Position of the closed-widget hint relative to the trigger. Supported values: "left", "top", "bottom". Top hints automatically render below the trigger when the trigger is near the top edge.

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
  - Description: Custom session id to override the random session id used as default. With this prop, each page load starts the session with an empty history. The widget reads it when it mounts. To change it, replace the element.

- **ttl_hours:**
  - Type: Number
  - Required: No
  - Default: 24
  - Description: Maximum age of a stored session in hours. After this time the widget starts a new session, even if the visitor is active. `0` turns off the age limit.

- **widget_id:**
  - Type: String
  - Required: No
  - Default: `punku-chat-widget`
  - Description: Identifier of this widget instance. The widget exposes its control API as `window["<widget_id>_api"]` (`open()`, `close()`, `isOpen()`) and sends the identifier in client error reports. Set a different value for each widget when a page has more than one.

- **bottom_offset:**
  - Type: Number
  - Required: No
  - Default: 20
  - Description: Distance in pixels between the widget and the bottom edge of the viewport.

- **top_offset:**
  - Type: Number
  - Required: No
  - Default: 60
  - Description: Distance in pixels between the widget and the top edge of the viewport. Applies to top positions.

- **left_offset:**
  - Type: Number
  - Required: No
  - Default: 20
  - Description: Distance in pixels between the widget and the left edge of the viewport. Applies to left positions.

- **right_offset:**
  - Type: Number
  - Required: No
  - Default: 20
  - Description: Distance in pixels between the widget and the right edge of the viewport. Applies to right positions.

- **additional_headers:**
  - Type: JSON
  - Required: No
  - Description: Additional headers to send with the API requests.

- **client_error_report_url:**
  - Type: String
  - Required: No
  - Description: Optional endpoint that receives browser-side widget errors. Defaults to `${host_url}/api/v1/widget/client-errors`.

- **enable_client_error_reporting:**
  - Type: Boolean
  - Required: No
  - Default: true
  - Description: Controls whether the widget automatically POSTs browser-side widget errors to the reporting endpoint. The `punku-chat-error` browser event is still dispatched either way.

- **enable_trigger_relocation:**
  - Type: Boolean
  - Required: No
  - Default: true
  - Description: Controls whether the programmatic trigger relocation APIs are exposed. Set to false to hide `setTriggerPosition`, `resetTriggerPosition`, `trigger.position`, and `window.punku.trigger.position`.

- **z_index:**
  - Type: Number
  - Required: No
  - Default: 2147483000
  - Description: Stack order of the whole widget (trigger, hint and chat window) on the host page. The default puts the widget above floating WhatsApp buttons and below the banners of large cookie consent tools. The widget rounds the value and clamps it to the range 0 to 2147483647. It uses the default for a value that is not a number. A `zIndex` given to `setTriggerPosition` overrides this value while the trigger is relocated. See [Stacking order on the host page](#stacking-order-on-the-host-page) before you change it.

- **show_feedback:**
  - Type: Boolean
  - Required: No
  - Default: None (the prop has no effect)
  - Description: The widget accepts this attribute, but it ignores the value. The feedback buttons (thumbs up and down) sit under each bot reply. On a computer they show under the newest reply, under a reply with a vote, and under a reply that the pointer or the keyboard focus is on. On a touch screen they always show. They do not show on the welcome message or on error messages. You cannot turn them off with this prop.

- **link_color:**
  - Type: String
  - Required: No
  - Description: Customizes the color of hyperlinks inside bot messages and markdown content (hex code or CSS color). The color is applied to link states (normal, hover, visited) with automatic hover opacity adjustment for better user interaction. Accepts any valid CSS color format including hex codes (e.g., "#0066CC"), RGB values, or color names.

## Header and input bar

The header is one row: the header icon on a round avatar, the title with the online status and "Powered by" under it, and the actions on the right. The actions are "New conversation" and, on phones and tablets (or with `show_close_button_on_desktop`), "Close chat". A new conversation also clears the text in the input field. With `button_color`, the header takes that colour, as before.

In the default and dark themes, the avatar is a light circle with the icon in the theme's blue. A `header_icon` image shows without a circle.

The default theme uses one blue, `#0969da` (5.2:1 with white text), for the visitor bubbles, the launcher, the send button, the header icon and the link buttons.

The input bar holds a bordered input field with the arrow-up send button inside, and the AI notice under it. See `ai_notice_text` and `show_ai_notice`. The send button is dimmed until the field has text.

## Thinking and error states

While the assistant prepares a reply, its bubble shows three animated dots and a short thinking phrase. The phrases come from `loading_messages`. Without it, the widget shows its built-in phrases in the chat's language (see `default_language`). The `swarovski` theme keeps its crystal loader and crystal phrases. If the visitor's system asks for reduced motion, the dots do not move.

The input field stays enabled while the assistant answers, so the visitor can write the next message. Enter and the send button send it after the reply is complete.

If a reply fails, the chat shows a plain sentence in the chat's language, for example "Sorry, we're experiencing technical issues. Please try again." The visitor never sees technical text: not HTTP status codes, and not the error text that a flow sends in its stream. These details go only to the browser console and to [client error notifications](#client-error-notifications). The newest error has a **Try again** button. It removes the error, sends the visitor's last message again and keeps the keyboard focus in the input field.

Screen readers hear "The assistant is writing" when a message is sent. When the answer is complete, they hear the answer once, as plain text without markdown marks. They also hear each new error once. Messages restored from a stored session are not read again on page load.

## Accessibility and motion

- The launcher button says what it does ("Open chat" or "Close chat", in the chat's language) and tells screen readers whether the chat is open.
- The message list is a log named "Conversation", in the chat's language. New answers are read once from a status region, so the log itself does not announce changes.
- The feedback buttons are "Helpful" and "Not helpful", in the chat's language, and report the vote.
- When the chat closes with the close button or Escape, the keyboard focus returns to the launcher. A closed chat window is out of the tab order.
- The chat focuses its input when it opens. After an answer, it focuses the input again only on devices with a mouse or trackpad, and never takes the focus from the host page or from a link in the messages.
- The window fades in and rises 12px when it opens, and new messages fade in. If the visitor's system asks for reduced motion, nothing moves.

## Stacking order on the host page

The widget uses one z-index for the trigger, the hint and the chat window. The default is 2147483000. It puts the widget above most other elements of the host page.

A dialog that the visitor must answer first stays above the widget. While the page shows one of these, the widget takes a z-index just below the layer of that dialog:
- a dialog with `aria-modal="true"` or `role="alertdialog"`, for example Borlabs Cookie;
- a dialog (`role="dialog"`) whose name, id or class contains cookie, consent, privacy, Datenschutz, GDPR or DSGVO, for example CookieScript ("Cookie consent dialog");
- a fixed backdrop over the whole screen with one of these words in its id or class, for example the Contao privacy opt-in (`privacy_overlay`).

When the dialog closes, the widget returns to its own z-index within a second. A floating WhatsApp button or a greeting bubble is none of these, so the widget stays above it.

While the chat window is open, the widget puts it in the browser's top layer (a popover). There it is above every z-index of the page, also above an element at the highest value 2147483647, such as an accessibility button. This does not apply while a consent dialog is visible (see above) or on a scaled Wix page. Browsers without popovers (Safari before 17, Firefox before 125) keep the z-index.

### Known values

These values come from the published code of each product (October 2026). A product can change its value in a new version.

| Host element | z-index | Covers the widget at the default? |
|---|---|---|
| Joinchat WhatsApp button | 9000 | No |
| GetButton and WATI WhatsApp buttons | 16000160 | No |
| Click to Chat and Elfsight WhatsApp buttons | 99999999 | No |
| Complianz cookie banner | 99999 | No |
| Borlabs Cookie dialog | 999999 | No |
| CookieYes banner, overlay, preference dialog | 9999999, 99999999, 999999999 | No |
| Iubenda cookie banner | 99999998 | No |
| Cookiebot dialog | 2147483631 | Yes |
| Usercentrics and Didomi banners | 2147483640 | Yes |
| OneTrust banner | 2147483645 | Yes |
| Intercom launcher | 2147483001 | Yes |
| HubSpot chat | 2147483647 | Yes |

The last column compares the z-index values only. While a consent dialog is visible, the widget steps below it (see the start of this section). This was checked on the real pages of Borlabs Cookie, CookieScript and the Contao privacy opt-in.

Menus, lightboxes, popups and newsletter dialogs of the site itself often use values from 9999 to 999999. The widget now paints above them too. Before this default, the widget used 9998 and stayed below most of them.

### When the widget covers a consent banner or a site element

- Closed widget: the trigger and the hint can cover a button of a banner or menu in the same corner.
- Open widget on a phone: the chat window fills the screen above the trigger. It covers a centered consent dialog with a value below 2147483000 that the widget does not recognise (see the start of this section). This happens with `start_open="true"`, or when a visitor opens the chat before they answer the consent dialog.
- Open widget on a tablet: the chat window fills a large part of the screen and can cover a part of a centered dialog.
- Open widget on a desktop: the chat window stays in its corner. It normally does not reach a centered dialog.

To keep an element above the widget, set `z_index` below the value of that element:

1. Open the page in a desktop browser.
2. Right-click the banner or element, then click **Inspect**.
3. In the Elements panel, select the outermost element of the banner. This is usually the element with `position: fixed`.
4. In the **Computed** tab, find `z-index`. Note the value.
5. Do steps 2 to 4 again for each floating button that the widget must cover, for example a WhatsApp button.
6. Choose a value that is lower than the banner and higher than the button. Example: Complianz (99999) and Joinchat (9000) give `z_index="99990"`.
7. Add the attribute to the snippet by hand. The PUNKU.AI snippet generator does not offer `z_index` yet:

```html
<punku-chat
  flow_id="your-flow-id"
  z_index="99990"
></punku-chat>
```

Some pairs have no working value. Click to Chat (99999999) with Complianz (99999) is an example: the button is higher than the banner, so no value is above the button and below the banner. In this case, do one of these steps:

- Lower the button. Click to Chat has a z-index setting.
- Raise the banner. Iubenda has the option `banner.zIndex`.
- Keep the banner above the widget. Visitors must be able to answer the consent dialog. The widget then stays below the button.

### Value rules

- A fractional value is rounded, for example 12.6 becomes 13.
- A value below 0 becomes 0. A negative value would paint the widget below the page content, and the content could hide the trigger.
- A value above 2147483647 becomes 2147483647.
- A value that is not a number gives the default 2147483000.

### Place the snippet directly in `<body>`

If a parent element creates a stacking context, no `z_index` value can lift the widget above other page elements. Examples are a parent with `transform`, `filter`, `opacity` below 1, or a `z-index` on a positioned parent. Place the snippet directly in `<body>`.

## Client Error Notifications

Some browser-side failures happen before a request reaches your normal PUNKU run endpoint, such as invalid header values, CORS/preflight failures, DNS/TLS failures, blocked requests, or network loss. The widget reports these failures itself by POSTing to `${host_url}/api/v1/widget/client-errors` by default. If `host_url` is omitted, it defaults to `https://app.punku.ai`.

```html
<punku-chat
  flow_id="your-flow-id"
></punku-chat>
```

You can override the endpoint:

```html
<punku-chat
  host_url="https://your-punku-instance.com"
  flow_id="your-flow-id"
  client_error_report_url="https://your-api.example.com/widget-client-errors"
></punku-chat>
```

The endpoint should return `202` with `{ "status": "queued" }`. Reporting is best-effort; failures from this endpoint are swallowed and never block the chat UI.

The report payload matches the platform endpoint schema:

```json
{
  "message": "Failed to read headers",
  "flow_id": "your-flow-id",
  "widget_id": "punku-chat-widget",
  "session_id": "optional-session-id",
  "error_type": "ERR_INVALID_REQUEST_HEADER",
  "status_code": null,
  "page_url": "https://customer.example.com/chat",
  "run_url": "https://app.punku.ai/api/v1/run/your-flow-id",
  "host_url": "https://app.punku.ai",
  "stack": "Error stack when available",
  "details": {
    "phase": "send-message",
    "classification": "invalid_request_header",
    "header_name": "X-Custom-Header",
    "message_length": 5,
    "streaming": false
  }
}
```

The widget does not include `api_key`, authorization headers, cookies, user messages, response bodies, or full request headers. Page and run URLs are sent without query strings or hashes. If a header is invalid, `error_type` is `ERR_INVALID_REQUEST_HEADER` and `details.header_name` contains the invalid header name.

The widget also dispatches a global `punku-chat-error` event for host pages that want custom handling:

```html
<script>
  window.addEventListener("punku-chat-error", (event) => {
    const detail = event.detail;

    navigator.sendBeacon(
      "/client-errors",
      JSON.stringify(detail)
    );
  });
</script>
```
