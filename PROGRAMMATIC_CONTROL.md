# Programmatic Control for Punku Chat Widget

This document explains how to control the Punku Chat Widget programmatically using JavaScript.

## Overview

The chat widget now supports programmatic control, allowing you to:
- Open/close the widget from external JavaScript
- Open the widget with a prefilled user message that is sent immediately
- Check widget state
- Relocate the trigger unless `enable_trigger_relocation` is false

## Setup

### 1. Basic Widget Setup

```html
<punku-chat
  host_url="https://your-api-url.com"
  flow_id="your-flow-id"
  api_key="your-api-key"
  widget_id="my-chat-widget"
  start_open="false">
</punku-chat>
```

widget_id defaults to "punku-chat-widget"
start_open defaults to "false"

### 2. Using the Global API

Once the widget is loaded, you can access it via the global API:

```javascript
// Access the widget API (replace 'my-chat-widget' with your widget_id)
const chatWidget = window['my-chat-widget_api'];

// Open the widget
chatWidget.open();

// Open the widget and send the first user message immediately
chatWidget.open('Hello there, tell me details for experience Fly me to the moon');

// Close the widget
chatWidget.close();

// Check if widget is open
const isOpen = chatWidget.isOpen();
console.log('Widget is open:', isOpen);
```

#### Your own open and close button

A press outside the open widget closes it. If your page opens and closes the widget with its own button, add `data-punku-chat-toggle` to that button. Otherwise the press closes the widget, and your click handler opens it again.

```html
<button id="my-chat-button" data-punku-chat-toggle>Chat</button>
<script>
  document.getElementById('my-chat-button').addEventListener('click', () => {
    const chatWidget = window['my-chat-widget_api'];
    if (chatWidget.isOpen()) chatWidget.close();
    else chatWidget.open();
  });
</script>
```

The widget also accepts `data-punku-handler`, which existing page scripts set.

If your button replaces the trigger (`chat_trigger_style='{"display":"none"}'`), the phone window still keeps 80 px free above the bottom of the screen for the trigger. Use `mobile_chat_window_style` to place it on phones, for example above a bottom bar of your page. See the README.

Call `open()` in the click handler itself. Then the chat moves the keyboard focus to its input, because the visitor opened it. A call from a timer, or after the handler waits for a network request, is no visitor action: the chat opens and the focus stays on the page (WCAG 3.2.1).

When the visitor closes the chat with its close button or Escape, the keyboard focus goes back to the page control that had the focus when `open()` ran, for example your button. If that control is off the screen, or on a touch screen is a text field (which would open the on-screen keyboard), the trigger gets the focus instead. With a hidden trigger, your control gets it anyway.

### 3. Trigger Relocation API

Trigger relocation APIs are enabled by default. To hide them for an embed, set
`enable_trigger_relocation="false"` in the widget configuration:

```html
<punku-chat
  host_url="https://your-api-url.com"
  flow_id="your-flow-id"
  api_key="your-api-key"
  widget_id="my-chat-widget"
  enable_trigger_relocation="false">
</punku-chat>
```

By default, the widget exposes both the widget-scoped API and the shared
`window.punku.trigger` alias:

```javascript
const chatWidget = window['my-chat-widget_api'];

// Move the closed trigger to a fixed viewport coordinate.
// The widget keeps its z_index value. See the zIndex note below.
chatWidget.setTriggerPosition({ x: 100, y: 300 });

// The trigger API exposes the same behavior.
chatWidget.trigger.setPosition({ x: 100, y: 300 });
chatWidget.trigger.position = { x: 100, y: 300 };
window.punku.trigger.position = { x: 100, y: 300 };

// Read the current override, or reset back to chat_position and offsets.
console.log(chatWidget.trigger.position);
chatWidget.resetTriggerPosition();
chatWidget.trigger.resetPosition();
```

`zIndex` is optional. Omit it in most cases. Without it, the relocated trigger
keeps the `z_index` widget prop (default 2147483000).

```javascript
// Only to change the stack order while the trigger is relocated.
chatWidget.setTriggerPosition({ x: 100, y: 300, zIndex: 2147483000 });
```

While the trigger is relocated, `zIndex` overrides `z_index`. The widget treats
it like `z_index`: it rounds the value and clamps it to the range 0 to
2147483647. It ignores a value that is not a finite number. A low value, such as
`10003`, puts the widget below floating buttons of other tools, such as WhatsApp
chat icons (often 99999999). Read the `z_index` section of the README before you
set a value.

The closed-widget hint follows the relocated trigger. For side hints, the widget
checks whether the trigger center is on the left or right half of the viewport
and places the hint on the opposite side of the trigger. Top and bottom hints
use the same calculation to choose left alignment when the trigger is on the
left. If a top hint would render from a trigger near the top edge, the widget
automatically uses the bottom hint placement instead.

Some host pages fix a small layout width, for example Wix sites with
`<meta name="viewport" content="width=320">`. The browser then scales the page
up to the screen width. On such a page, the widget normally lays out at the
real screen size. A relocated trigger uses page coordinates, so while the
trigger is relocated, the widget uses the unscaled page layout instead.

### 4. Example Testing Script
<script>
    // Wait for the widget to load
    function waitForWidget() {
        return new Promise((resolve) => {
            const checkWidget = () => {
                if (window['punku-chat-widget_api']) {
                    resolve(window['punku-chat-widget_api']);
                } else {
                    setTimeout(checkWidget, 100);
                }
            };
            checkWidget();
        });
    }
    
    // Update status display
    function updateStatus(message) {
        const statusDiv = document.getElementById('status');
        const timestamp = new Date().toLocaleTimeString();
        if (statusDiv) {
            statusDiv.innerHTML = `[${timestamp}] ${message}`;
        } else {
            console.log(`[${timestamp}] ${message}`);
        }
    }
    
    // Programmatic control functions
    async function openChat() {
        try {
            const widget = await waitForWidget();
            widget.open();
            updateStatus('✅ Chat opened programmatically');
        } catch (error) {
            updateStatus('❌ Error opening chat: ' + error.message);
        }
    }
    
    async function closeChat() {
        try {
            const widget = await waitForWidget();
            widget.close();
            updateStatus('✅ Chat closed programmatically');
        } catch (error) {
            updateStatus('❌ Error closing chat: ' + error.message);
        }
    }
    
    async function checkStatus() {
        try {
            const widget = await waitForWidget();
            const isOpen = widget.isOpen();
            updateStatus(`📊 Status - Open: ${isOpen}`);
        } catch (error) {
            updateStatus('❌ Error checking status: ' + error.message);
        }
    }
    
    // Auto-test when page loads
    window.addEventListener('load', async function() {
        updateStatus('🚀 Page loaded - testing widget connection...');
        
        try {
            const widget = await waitForWidget();
            updateStatus('✅ Widget API loaded successfully! Ready to test programmatic control.');

            checkStatus();
            
            // Test sequence: Open -> Wait -> Close -> Wait -> Open again
            setTimeout(() => {
                updateStatus('🔄 Auto-opening chat in 2 seconds...');
            }, 1000);
            
            setTimeout(() => {
                widget.open();
                updateStatus('✅ Auto-opened chat successfully!');
            }, 3000);
            
            // Close after 5 seconds
            setTimeout(() => {
                updateStatus('🔄 Auto-closing chat in 2 seconds...');
            }, 5000);
            
            setTimeout(() => {
                widget.close();
                updateStatus('✅ Auto-closed chat successfully!');
            }, 7000);
            
        } catch (error) {
            updateStatus('❌ Error loading widget API: ' + error.message);
        }
    });     
</script>
