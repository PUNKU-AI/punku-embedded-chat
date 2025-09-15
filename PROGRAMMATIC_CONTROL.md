# Programmatic Control for Punku Chat Widget

This document explains how to control the Punku Chat Widget programmatically using JavaScript.

## Overview

The chat widget now supports programmatic control, allowing you to:
- Open/close the widget from external JavaScript
- Check widget state

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

// Close the widget
chatWidget.close();

// Check if widget is open
const isOpen = chatWidget.isOpen();
console.log('Widget is open:', isOpen);
```

### 3. Example Testing Script
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