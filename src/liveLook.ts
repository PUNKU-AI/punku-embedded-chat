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

// The settings that the live look took back, as a JSON list. The element drops them, so the
// widget's own defaults apply again. Only this file sets it.
export const LOOK_UNSET_ATTRIBUTE = "look_unset";

/** What the live look did on one element: the value it set per attribute, and the settings it took back. */
export interface LookState {
  applied: Map<string, string>;
  unset: Set<string>;
}

export function newLookState(): LookState {
  return { applied: new Map(), unset: new Set() };
}
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

/** The page's extra headers (`additional_headers`), when the attribute holds a JSON object of texts. */
export function readHeadersAttribute(text: string | null): Record<string, string> | undefined {
  if (!text) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.every(([, header]) => typeof header === "string")
      ? Object.fromEntries(entries as [string, string][])
      : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchLook(
  hostUrl: string,
  flowId: string,
  publishableKey: string,
  additionalHeaders?: Record<string, string>
): Promise<LookAnswer> {
  const query = `flow_id=${encodeURIComponent(flowId)}&publishable_key=${encodeURIComponent(publishableKey)}`;
  // A proxy in front of the server may need the page's extra headers, as on every chat call.
  const init: RequestInit = { credentials: "omit" };
  if (additionalHeaders && Object.keys(additionalHeaders).length > 0) {
    init.headers = additionalHeaders;
  }
  try {
    const response = await fetch(`${hostUrl}${LOOK_PATH}?${query}`, init);
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

/**
 * Set the look attributes that the page did not set itself. When a newer look no longer has a
 * setting that an earlier look set (the owner removed it, or set it back to its default), take it
 * back, so that the widget's default applies again. Returns whether an attribute changed.
 */
export function applyLook(
  element: Element,
  look: Look,
  pageAttributes: ReadonlySet<string>,
  state: LookState = newLookState()
): boolean {
  let changed = false;
  for (const [name, text] of Array.from(state.applied)) {
    if (Object.prototype.hasOwnProperty.call(look, name)) {
      continue;
    }
    state.applied.delete(name);
    // A value that the page set after the look stays.
    if (element.getAttribute(name) === text) {
      element.removeAttribute(name);
      state.unset.add(name);
      changed = true;
    }
  }
  for (const [name, text] of Object.entries(look)) {
    if (!LOOK_ATTRIBUTES.has(name) || pageAttributes.has(name)) {
      continue;
    }
    state.applied.set(name, text);
    if (state.unset.delete(name)) {
      changed = true;
    }
    if (element.getAttribute(name) !== text) {
      element.setAttribute(name, text);
      changed = true;
    }
  }
  if (changed) {
    if (state.unset.size > 0) {
      element.setAttribute(LOOK_UNSET_ATTRIBUTE, JSON.stringify(Array.from(state.unset).sort()));
    } else {
      element.removeAttribute(LOOK_UNSET_ATTRIBUTE);
    }
  }
  return changed;
}
