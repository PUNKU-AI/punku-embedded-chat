import { SessionStorage } from "../utils/sessionStorage";
import { createHttpError } from "./backendError";

/*
 * Visitor tokens.
 *
 * The page holds a public key (`publishable_key`), or the widget key of an older
 * embed code (`api_key`). Before the first chat call the widget trades it at
 * POST /api/v1/widget/sessions for a short-lived visitor token, and each chat
 * call then sends the token in the `x-widget-token` header. The server checks
 * the key and the website when it gives out the token.
 *
 * Tokens stay in memory only, one per chat session. A new chat session gets a
 * new token. The server sends back the session id that the token runs; the
 * widget stores it, so the next page keeps the conversation.
 */

export const WIDGET_TOKEN_HEADER = "x-widget-token";
const SESSIONS_PATH = "/api/v1/widget/sessions";
// Get a new token this long before the old one expires.
const REFRESH_MARGIN_MS = 60_000;
// After a server without the token route, ask again after this long.
const ROUTE_MISSING_RETRY_MS = 10 * 60_000;

export const WIDGET_NOT_ALLOWED_CODE = "ERR_WIDGET_NOT_ALLOWED_HERE";

// The server makes every public key as "pk_" plus URL-safe characters. Any other value
// in publishable_key (for example an API key) is no public key: the widget ignores it
// and uses api_key, as before public keys existed.
const PUBLIC_KEY_PATTERN = /^pk_[A-Za-z0-9_-]{16,128}$/;

/** The page's publishable_key when it is a public key, else undefined. */
export function usablePublishableKey(value: unknown): string | undefined {
  return typeof value === "string" && PUBLIC_KEY_PATTERN.test(value) ? value : undefined;
}

function publicKeyOf(credentials: WidgetCredentials): string | undefined {
  return usablePublishableKey(credentials.publishableKey);
}

export interface WidgetCredentials {
  hostUrl: string;
  flowId: string;
  sessionId: { current: string };
  publishableKey?: string;
  apiKey?: string;
  // The page's extra headers (`additional_headers`). A proxy in front of the server may need them.
  additionalHeaders?: Record<string, string>;
}

export interface WidgetAuthHeaders {
  headers: Record<string, string>;
  fromToken: boolean;
}

interface CachedToken {
  token: string;
  sessionId: string;
  expiresAtMs: number;
}

type ExchangeResult = CachedToken | "use-key";

const tokens = new Map<string, CachedToken>();
// Old embed codes whose key the server will not trade (a server without the route,
// or an account API key). They send the key directly, as before.
const directKeyUntil = new Map<string, number>();

/** The owner limited the widget to other websites. The visitor sees a short note. */
export function createWidgetNotAllowedError(): Error {
  return Object.assign(new Error("This chat is not available on this website."), { code: WIDGET_NOT_ALLOWED_CODE });
}

export function isWidgetNotAllowed(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === WIDGET_NOT_ALLOWED_CODE;
}

function credentialKey(credentials: WidgetCredentials): string {
  const publicKey = publicKeyOf(credentials);
  const credential = publicKey
    ? `public:${publicKey}`
    : `key:${credentials.apiKey ?? ""}`;
  return `${credentials.hostUrl}|${credentials.flowId}|${credential}`;
}

/** Forget the token of these credentials, so the next call gets a new one. */
export function forgetWidgetToken(credentials: WidgetCredentials): void {
  tokens.delete(credentialKey(credentials));
}

/** Tests only: start from an empty cache. */
export function resetWidgetAuthForTests(): void {
  tokens.clear();
  directKeyUntil.clear();
}

function adoptSession(credentials: WidgetCredentials, sessionId: string): void {
  if (!sessionId || credentials.sessionId.current === sessionId) {
    return;
  }
  credentials.sessionId.current = sessionId;
  SessionStorage.updateSessionId(credentials.flowId, sessionId);
}

function directKey(credentials: WidgetCredentials): WidgetAuthHeaders {
  return { headers: credentials.apiKey ? { "x-api-key": credentials.apiKey } : {}, fromToken: false };
}

function readDetail(body: string): unknown {
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? (parsed as { detail?: unknown }).detail : undefined;
  } catch {
    return undefined;
  }
}

async function exchange(credentials: WidgetCredentials): Promise<ExchangeResult> {
  const body: Record<string, string> = { flow_id: credentials.flowId };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const publicKey = publicKeyOf(credentials);
  if (publicKey) {
    body.publishable_key = publicKey;
  } else if (credentials.apiKey) {
    headers["x-api-key"] = credentials.apiKey;
  }
  if (credentials.sessionId.current) {
    body.session_id = credentials.sessionId.current;
  }
  // The page's extra headers go with the token request too, and win, as on every chat call.
  Object.assign(headers, credentials.additionalHeaders);

  const keyCanRunDirectly = !!credentials.apiKey && !publicKey;
  let response: Response;
  try {
    response = await fetch(`${credentials.hostUrl}${SESSIONS_PATH}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "omit",
    });
  } catch (error) {
    // An older embed code works as before when the token request cannot reach the server,
    // for example a server whose 404 answers carry no CORS headers. A public key cannot.
    if (keyCanRunDirectly) {
      return "use-key";
    }
    throw error;
  }

  if (response.ok) {
    const data = await response.json();
    if (typeof data?.token !== "string" || typeof data?.session_id !== "string" || typeof data?.expires_at !== "number") {
      throw new Error("The widget token answer is not valid.");
    }
    return { token: data.token, sessionId: data.session_id, expiresAtMs: data.expires_at * 1000 };
  }

  const text = await response.text();
  if (response.status === 403 && readDetail(text) === "widget_origin_not_allowed") {
    throw createWidgetNotAllowedError();
  }
  // An older embed code keeps working as before when the server cannot trade its key:
  // the server has no token route yet (404, 405), or the key is an account API key
  // (403), which old embed codes may hold. The run route still checks the key itself.
  if (keyCanRunDirectly && (response.status === 404 || response.status === 405 || response.status === 403)) {
    return "use-key";
  }
  throw createHttpError(response.status, text);
}

/** The auth headers of the next chat call: a visitor token, the old widget key, or none. */
export async function widgetAuthHeaders(credentials: WidgetCredentials): Promise<WidgetAuthHeaders> {
  if (!publicKeyOf(credentials) && !credentials.apiKey) {
    return { headers: {}, fromToken: false };
  }
  const key = credentialKey(credentials);
  const cached = tokens.get(key);
  const session = credentials.sessionId.current;
  if (cached && (!session || cached.sessionId === session) && cached.expiresAtMs - Date.now() > REFRESH_MARGIN_MS) {
    return { headers: { [WIDGET_TOKEN_HEADER]: cached.token }, fromToken: true };
  }
  if ((directKeyUntil.get(key) ?? 0) > Date.now()) {
    return directKey(credentials);
  }

  const result = await exchange(credentials);
  if (result === "use-key") {
    directKeyUntil.set(key, Date.now() + ROUTE_MISSING_RETRY_MS);
    return directKey(credentials);
  }
  tokens.set(key, result);
  adoptSession(credentials, result.sessionId);
  return { headers: { [WIDGET_TOKEN_HEADER]: result.token }, fromToken: true };
}

/**
 * Send a chat call with the widget's auth headers. When the server refuses the token (401),
 * get a new token once and send the call once more. The refusal reaches no error report.
 */
export async function fetchWithWidgetAuth(
  credentials: WidgetCredentials,
  send: (authHeaders: Record<string, string>) => Promise<Response>
): Promise<Response> {
  const first = await widgetAuthHeaders(credentials);
  const response = await send(first.headers);
  if (response.status !== 401 || !first.fromToken) {
    return response;
  }
  forgetWidgetToken(credentials);
  const second = await widgetAuthHeaders(credentials);
  return send(second.headers);
}
