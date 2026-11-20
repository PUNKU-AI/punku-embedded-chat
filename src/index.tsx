import r2wc from '@r2wc/react-to-web-component';
import type { ComponentProps } from 'react';
import ChatWidget, { DEFAULT_HOST_URL } from './chatWidget';
import {
    FIRST_LOOK_WAIT_MS,
    applyLook,
    clearCachedLook,
    fetchLook,
    readCachedLook,
    writeCachedLook,
    type Look,
} from './liveLook';

type ChatElementClass = new () => HTMLElement & { connectedCallback(): void };

// A new value starts the widget again with its current attributes, so that the look's settings that
// the widget reads only at start (start_open, the session limits) apply too.
const LOOK_REVISION_ATTRIBUTE = "look_revision";

function LiveLookChatWidget({ look_revision, ...props }: ComponentProps<typeof ChatWidget> & { look_revision?: string }) {
    return <ChatWidget key={look_revision ?? "page"} {...props} />;
}

function createChatElement() {
    const Base = r2wc(LiveLookChatWidget, {
        shadow: "closed",
        props: {
            start_open: "boolean",
            api_key: "string",
            publishable_key: "string",
            output_type: "string",
            input_type: "string",
            output_component: "string",
            chat_trigger_style: "json",
            host_url: "string",
            flow_id: "string",
            online: "boolean",
            online_message: "string",
            branding: "string",
            window_title: "string",
            tweaks:"json",
            bot_message_style:"json",
            user_message_style:"json",
            chat_window_style:"json",
            mobile_chat_window_style:"json",
            height:"number",
            width:"number",
            session_id:"string",
            chat_output_key:"string",
            error_message_style:"json",
            send_button_style:"json",
            send_icon_style:"json",
            placeholder:"string",
            placeholder_sending:"string",
            loading_messages:"json",
            ai_notice_text: "string",
            unavailable_contact_email: "string",
            show_ai_notice: "boolean",
            checkout_card_venue: "string",
            input_style:"json",
            input_container_style:"json",
            chat_position:"string",
            additional_headers:"json",
            theme: "string",
            welcome_message: "string",
            suggestions: "json",
            show_feedback: "boolean",
            default_language: "string",
            header_icon: "string",
            header_icon_name: "string",
            trigger_icon: "string",
            button_color: "string",
            button_text_color: "string",
            background_color: "string",
            bot_message_color: "string",
            user_message_color: "string",
            user_message_text_color: "string",
            bot_message_text_color: "string",
            widget_id: "string",
            ttl_hours: "number",
            idle_expiration_hours: "number",
            link_color: "string",
            bottom_offset: "number",
            top_offset: "number",
            left_offset: "number",
            right_offset: "number",
            closed_widget_hint_text: "string",
            show_closed_widget_hint: "boolean",
            show_close_button_on_desktop: "boolean",
            closed_widget_hint_auto_hide_ms: "number",
            closed_widget_hint_show_once: "boolean",
            closed_widget_hint_position: "string",
            closed_widget_hint_background_color: "string",
            closed_widget_hint_text_color: "string",
            client_error_report_url: "string",
            enable_client_error_reporting: "boolean",
            enable_trigger_relocation: "boolean",
            z_index: "number",
            look_revision: "string",
        },
    }) as unknown as ChatElementClass;

    // An embed code with a public key gets its look from the server (live sync).
    return class PunkuChatElement extends Base {
        private lookRequested = false;
        private lookRevision = 0;

        connectedCallback() {
            super.connectedCallback();
            const publishableKey = this.getAttribute("publishable_key");
            const flowId = this.getAttribute("flow_id");
            if (!publishableKey || !flowId || this.lookRequested) {
                return;
            }
            this.lookRequested = true;
            const hostUrl = (this.getAttribute("host_url") || DEFAULT_HOST_URL).replace(/\/+$/, "");
            // The page's own attributes win over the server's look.
            const pageAttributes = new Set(this.getAttributeNames());
            const showLook = (look: Look) => {
                if (applyLook(this, look, pageAttributes)) {
                    this.lookRevision += 1;
                    this.setAttribute(LOOK_REVISION_ATTRIBUTE, String(this.lookRevision));
                }
            };

            const cached = readCachedLook(hostUrl, flowId);
            // A first visit waits a short time for the look, so that the default look does not flash.
            const reveal = cached ? () => undefined : this.hideWhileLoading();
            if (cached) {
                showLook(cached);
            }
            const timer = cached ? undefined : window.setTimeout(reveal, FIRST_LOOK_WAIT_MS);
            void fetchLook(hostUrl, flowId, publishableKey).then((look) => {
                window.clearTimeout(timer);
                if (look === "hidden") {
                    // The key was rotated or the widget removed: no chat on this page.
                    clearCachedLook(hostUrl, flowId);
                    this.style.display = "none";
                    console.warn("punku-chat: this embed code is no longer valid. Copy the new embed code from PUNKU.AI.");
                    return;
                }
                if (look) {
                    showLook(look);
                    writeCachedLook(hostUrl, flowId, look);
                }
                reveal();
            });
        }

        /** Make the widget invisible and inert. Returns the function that shows it again. */
        private hideWhileLoading(): () => void {
            const { opacity, pointerEvents } = this.style;
            this.style.opacity = "0";
            this.style.pointerEvents = "none";
            let shown = false;
            return () => {
                if (shown) return;
                shown = true;
                this.style.opacity = opacity;
                this.style.pointerEvents = pointerEvents;
            };
        }
    };
}

function defineChatElement(tagName: string) {
    if (!customElements.get(tagName)) {
        customElements.define(tagName, createChatElement());
    }
}

defineChatElement('punku-chat');
defineChatElement('punku-chat-widget');
