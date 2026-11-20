/*
 * Live look.
 *
 * An embed code with a public key (`publishable_key`) holds no look attributes.
 * The widget reads its look from GET {host_url}/api/v1/widget/config, so a change
 * that the owner saves in the app shows on the website without a new embed code.
 * The answer holds the attribute text that an embed code would hold.
 *
 * Attributes that the page sets itself win over the server's look. The last look
 * is kept in localStorage, so a returning visitor sees the right look at once.
 */

const LOOK_PATH = "/api/v1/widget/config";
const CACHE_PREFIX = "punku-chat-look";
// On the first visit the widget waits this long for its look before it shows.
export const FIRST_LOOK_WAIT_MS = 1500;

// The attributes that the server's look may set. Keep in sync with WIDGET_LOOK_ATTRIBUTES in the
// app's backend (api/v1/bookingkit_agents.py). Never the flow, the host, a key, the request options
// or the session, also if a server sent them.
export const LOOK_ATTRIBUTES: ReadonlySet<string> = new Set([
  "window_title",
  "theme",
  "branding",
  "chat_position",
  "placeholder",
  "placeholder_sending",
  "welcome_message",
  "loading_messages",
  "height",
  "width",
  "start_open",
  "bottom_offset",
  "top_offset",
  "left_offset",
  "right_offset",
  "show_close_button_on_desktop",
  "default_language",
  "online",
  "online_message",
  "trigger_icon",
  "header_icon",
  "header_icon_name",
  "show_feedback",
  "chat_output_key",
  "ttl_hours",
  "idle_expiration_hours",
  "closed_widget_hint_text",
  "show_closed_widget_hint",
  "closed_widget_hint_position",
  "closed_widget_hint_auto_hide_ms",
  "closed_widget_hint_background_color",
  "closed_widget_hint_text_color",
  "background_color",
  "button_color",
  "button_text_color",
  "bot_message_color",
  "bot_message_text_color",
  "user_message_color",
  "user_message_text_color",
  "link_color",
  "chat_window_style",
  "chat_trigger_style",
  "send_button_style",
  "bot_message_style",
  "user_message_style",
  "error_message_style",
  "input_container_style",
  "input_style",
  "send_icon_style",
]);

export type Look = Record<string, string>;
/** The widget's look, "hidden" when the server knows no widget for this key, or null when it cannot answer. */
export type LookAnswer = Look | "hidden" | null;

function cacheKey(hostUrl: string, flowId: string): string {
  return `${CACHE_PREFIX}-${hostUrl}-${flowId}`;
}

function onlyLookAttributes(value: unknown): Look | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const look: Look = {};
  for (const [name, text] of Object.entries(value as Record<string, unknown>)) {
    if (LOOK_ATTRIBUTES.has(name) && typeof text === "string") {
      look[name] = text;
    }
  }
  return look;
}

export function readCachedLook(hostUrl: string, flowId: string): Look | null {
  try {
    const stored = localStorage.getItem(cacheKey(hostUrl, flowId));
    return stored ? onlyLookAttributes(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export function writeCachedLook(hostUrl: string, flowId: string, look: Look): void {
  try {
    localStorage.setItem(cacheKey(hostUrl, flowId), JSON.stringify(look));
  } catch {
    // A full or blocked storage only costs the returning visitor the wait.
  }
}

export function clearCachedLook(hostUrl: string, flowId: string): void {
  try {
    localStorage.removeItem(cacheKey(hostUrl, flowId));
  } catch {
    // Nothing to clear.
  }
}

export async function fetchLook(hostUrl: string, flowId: string, publishableKey: string): Promise<LookAnswer> {
  const query = `flow_id=${encodeURIComponent(flowId)}&publishable_key=${encodeURIComponent(publishableKey)}`;
  try {
    const response = await fetch(`${hostUrl}${LOOK_PATH}?${query}`, { credentials: "omit" });
    if (response.status === 404) {
      // The server answers 404 with this detail for a wrong or rotated key. A server
      // without the route answers 404 too, without it: the widget then keeps its defaults.
      const body = await response.json().catch(() => null);
      return body?.detail === "widget_not_available" ? "hidden" : null;
    }
    if (!response.ok) {
      return null;
    }
    const body = await response.json();
    return onlyLookAttributes(body?.attributes);
  } catch {
    return null;
  }
}

/** Set the look attributes that the page did not set itself. Returns whether an attribute changed. */
export function applyLook(element: Element, look: Look, pageAttributes: ReadonlySet<string>): boolean {
  let changed = false;
  for (const [name, text] of Object.entries(look)) {
    if (!LOOK_ATTRIBUTES.has(name) || pageAttributes.has(name)) {
      continue;
    }
    if (element.getAttribute(name) !== text) {
      element.setAttribute(name, text);
      changed = true;
    }
  }
  return changed;
}
