import r2wc from '@r2wc/react-to-web-component';
import type { ComponentProps } from 'react';
import ChatWidget, { DEFAULT_HOST_URL } from './chatWidget';
import { usablePublishableKey } from './controllers/widgetAuth';
import {
    FIRST_LOOK_WAIT_MS,
    LOOK_ATTRIBUTES,
    applyLook,
    clearCachedLook,
    fetchLook,
    newLookState,
    readCachedLook,
    readHeadersAttribute,
    writeCachedLook,
    type Look,
} from './liveLook';

type ChatElementClass = new () => HTMLElement & { connectedCallback(): void };

// A new value starts the widget again with its current attributes, so that the look's settings that
// the widget reads only at start (start_open, the session limits) apply too. This happens only before
// the visitor can use the widget: a restart would drop a chat in progress.
const LOOK_REVISION_ATTRIBUTE = "look_revision";

type LiveLookProps = ComponentProps<typeof ChatWidget> & { look_revision?: string; look_unset?: unknown };

function LiveLookChatWidget({ look_revision, look_unset, ...props }: LiveLookProps) {
    // The live look took these settings back. A removed attribute reaches this component as null
    // or false, not as unset, so drop the prop: the widget's own default applies again.
    const shown: Record<string, unknown> = { ...props };
    // Only a public key ("pk_...") goes to the widget. Another value, such as an API key,
    // would fail as a public key; without it the widget uses api_key.
    if (shown.publishable_key !== undefined && !usablePublishableKey(shown.publishable_key)) {
        delete shown.publishable_key;
    }
    if (Array.isArray(look_unset)) {
        for (const name of look_unset) {
            if (typeof name === "string" && LOOK_ATTRIBUTES.has(name)) {
                delete shown[name];
            }
        }
    }
    return <ChatWidget key={look_revision ?? "page"} {...(shown as ComponentProps<typeof ChatWidget>)} />;
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
            look_unset: "json",
        },
    }) as unknown as ChatElementClass;

    // An embed code with a public key gets its look from the server (live sync).
    return class PunkuChatElement extends Base {
        private lookRequested = false;
        private lookRevision = 0;
        private lookState = newLookState();
        private keyWarned = false;
        // True once the visitor can use the widget. After that a new look never restarts it.
        private shown = false;

        connectedCallback() {
            super.connectedCallback();
            const pagePublishableKey = this.getAttribute("publishable_key");
            const publishableKey = usablePublishableKey(pagePublishableKey);
            if (pagePublishableKey && !publishableKey && !this.keyWarned) {
                this.keyWarned = true;
                console.warn("punku-chat: publishable_key is no public key (it starts with pk_). The widget ignores it and uses api_key.");
            }
            const flowId = this.getAttribute("flow_id");
            if (!publishableKey || !flowId || this.lookRequested) {
                return;
            }
            this.lookRequested = true;
            const hostUrl = (this.getAttribute("host_url") || DEFAULT_HOST_URL).replace(/\/+$/, "");
            // The page's own attributes win over the server's look.
            const pageAttributes = new Set(this.getAttributeNames());
            const showLook = (look: Look) => {
                const changed = applyLook(this, look, pageAttributes, this.lookState);
                // Once the widget shows, the look applies as props, without a restart. Settings that the
                // widget reads only at start then take effect on the next page, from the stored look.
                if (changed && !this.shown) {
                    this.lookRevision += 1;
                    this.setAttribute(LOOK_REVISION_ATTRIBUTE, String(this.lookRevision));
                }
            };

            const cached = readCachedLook(hostUrl, flowId);
            // A first visit waits a short time for the look, so that the default look does not flash.
            const reveal = cached ? () => undefined : this.hideWhileLoading();
            if (cached) {
                showLook(cached);
                this.shown = true;
            }
            const timer = cached ? undefined : window.setTimeout(reveal, FIRST_LOOK_WAIT_MS);
            const additionalHeaders = readHeadersAttribute(this.getAttribute("additional_headers"));
            void fetchLook(hostUrl, flowId, publishableKey, additionalHeaders).then((look) => {
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
            const wasInert = this.hasAttribute("inert");
            this.style.opacity = "0";
            this.style.pointerEvents = "none";
            // Inert also keeps the keyboard out, so nobody can start a chat that a restart would drop.
            this.setAttribute("inert", "");
            let revealed = false;
            return () => {
                if (revealed) return;
                revealed = true;
                this.shown = true;
                this.style.opacity = opacity;
                this.style.pointerEvents = pointerEvents;
                if (!wasInert) this.removeAttribute("inert");
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
