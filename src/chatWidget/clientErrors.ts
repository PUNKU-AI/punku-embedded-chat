export const PUNKU_CHAT_ERROR_EVENT = "punku-chat-error";

export type PunkuChatErrorPhase =
  "send-message" | "stream-message" | "send-feedback";

export type PunkuChatNormalizedError = {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  status?: number;
  headerName?: string;
};

export type PunkuChatErrorDetail = {
  event: typeof PUNKU_CHAT_ERROR_EVENT;
  phase: PunkuChatErrorPhase;
  widgetId: string;
  timestamp: string;
  flowId?: string;
  hostUrl?: string;
  sessionId?: string;
  error: PunkuChatNormalizedError;
  context?: Record<string, unknown>;
};

export type PunkuChatClientErrorReportPayload = {
  message: string;
  flow_id: string | null;
  widget_id: string | null;
  session_id: string | null;
  error_type: string | null;
  status_code: number | null;
  page_url: string | null;
  run_url: string | null;
  host_url: string | null;
  stack: string | null;
  details: Record<string, unknown> | null;
};

type CreatePunkuChatErrorDetailOptions = {
  error: unknown;
  phase: PunkuChatErrorPhase;
  widgetId?: string;
  flowId?: string;
  hostUrl?: string;
  sessionId?: string;
  context?: Record<string, unknown>;
};

type CreatePunkuChatErrorReportPayloadOptions = {
  pageUrl?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const REPORTING_PATH = "/api/v1/widget/client-errors";
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 4000;
const MAX_DETAIL_STRING_LENGTH = 500;

const SAFE_CONTEXT_KEYS: Record<string, string> = {
  feedback: "feedback",
  inputType: "input_type",
  messageId: "message_id",
  messageLength: "message_length",
  outputComponent: "output_component",
  outputType: "output_type",
  streaming: "streaming",
};

const getStringProperty = (
  value: Record<string, unknown> | undefined,
  property: string,
) => {
  const propertyValue = value?.[property];
  return typeof propertyValue === "string" ? propertyValue : undefined;
};

const getNumberProperty = (
  value: Record<string, unknown> | undefined,
  property: string,
) => {
  const propertyValue = value?.[property];
  return typeof propertyValue === "number" ? propertyValue : undefined;
};

const removeUndefinedProperties = (value: Record<string, unknown>) => {
  const result: Record<string, unknown> = {};

  Object.keys(value).forEach((key) => {
    if (typeof value[key] !== "undefined") {
      result[key] = value[key];
    }
  });

  return result;
};

const truncateString = (value: string, maxLength: number) =>
  value.length > maxLength ? value.slice(0, maxLength) : value;

const sanitizeErrorMessage = (message?: string) =>
  (message || "Unknown client error").replace(/,\s*body:\s*[\s\S]*$/i, "");

const sanitizeErrorStack = (stack?: string) => {
  if (!stack) {
    return undefined;
  }

  const [firstLine, ...remainingLines] = stack.split("\n");
  return [sanitizeErrorMessage(firstLine), ...remainingLines].join("\n");
};

const getStatusFromMessage = (message?: string) => {
  const match = message?.match(/\bstatus:\s*(\d{3})\b/i);

  if (!match) {
    return undefined;
  }

  const status = Number(match[1]);
  return Number.isNaN(status) ? undefined : status;
};

const compactString = (
  value?: string,
  maxLength = MAX_DETAIL_STRING_LENGTH,
) => {
  if (!value) {
    return null;
  }

  return truncateString(value, maxLength);
};

const cleanUrlWithoutQueryOrHash = (url?: string) => {
  if (!url || typeof url !== "string") {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return url.split(/[?#]/)[0] || null;
  }
};

const cleanBaseUrlWithoutQueryOrHash = (url?: string) => {
  const cleanUrl = cleanUrlWithoutQueryOrHash(url);
  return cleanUrl ? cleanUrl.replace(/\/+$/, "") : null;
};

const normalizeClientError = (error: unknown): PunkuChatNormalizedError => {
  if (error instanceof Error) {
    const errorRecord = error as Error & Record<string, unknown>;
    const response = isRecord(errorRecord.response)
      ? errorRecord.response
      : undefined;
    const message = sanitizeErrorMessage(error.message);
    const status =
      getNumberProperty(errorRecord, "status") ??
      getNumberProperty(response, "status") ??
      getStatusFromMessage(error.message);

    return {
      name: error.name || "Error",
      message,
      ...(error.stack ? { stack: sanitizeErrorStack(error.stack) } : {}),
      ...(getStringProperty(errorRecord, "code")
        ? { code: getStringProperty(errorRecord, "code") }
        : {}),
      ...(typeof status === "number" ? { status } : {}),
      ...(getStringProperty(errorRecord, "headerName")
        ? { headerName: getStringProperty(errorRecord, "headerName") }
        : {}),
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: sanitizeErrorMessage(error),
      ...(typeof getStatusFromMessage(error) === "number"
        ? { status: getStatusFromMessage(error) }
        : {}),
    };
  }

  if (isRecord(error)) {
    const response = isRecord(error.response) ? error.response : undefined;
    const rawMessage = getStringProperty(error, "message");
    const status =
      getNumberProperty(error, "status") ??
      getNumberProperty(response, "status") ??
      getStatusFromMessage(rawMessage);

    return {
      name: getStringProperty(error, "name") || "Error",
      message: sanitizeErrorMessage(rawMessage),
      ...(getStringProperty(error, "stack")
        ? { stack: sanitizeErrorStack(getStringProperty(error, "stack")) }
        : {}),
      ...(getStringProperty(error, "code")
        ? { code: getStringProperty(error, "code") }
        : {}),
      ...(typeof status === "number" ? { status } : {}),
      ...(getStringProperty(error, "headerName")
        ? { headerName: getStringProperty(error, "headerName") }
        : {}),
    };
  }

  return {
    name: "Error",
    message: "Unknown client error",
  };
};

const getPageUrl = (pageUrl?: string) => {
  if (pageUrl) {
    return cleanUrlWithoutQueryOrHash(pageUrl);
  }

  if (typeof window === "undefined" || !window.location?.href) {
    return null;
  }

  return cleanUrlWithoutQueryOrHash(window.location.href);
};

const getRunUrl = (detail: PunkuChatErrorDetail) => {
  if (!detail.hostUrl || !detail.flowId || detail.phase === "send-feedback") {
    return null;
  }

  return cleanUrlWithoutQueryOrHash(
    `${detail.hostUrl.replace(/\/+$/, "")}/api/v1/run/${detail.flowId}`,
  );
};

const classifyClientError = (detail: PunkuChatErrorDetail) => {
  const code = detail.error.code?.toLowerCase();
  const name = detail.error.name.toLowerCase();
  const message = detail.error.message.toLowerCase();

  if (code === "err_invalid_request_header") {
    return "invalid_request_header";
  }

  if (name === "aborterror" || message.includes("aborted")) {
    return "abort";
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }

  if (message.includes("cors")) {
    return "cors";
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  ) {
    return "network";
  }

  if (typeof detail.error.status === "number") {
    return "http";
  }

  return "client_exception";
};

const getSafeDetails = (detail: PunkuChatErrorDetail) => {
  const details: Record<string, unknown> = {
    phase: detail.phase,
    classification: classifyClientError(detail),
  };

  if (detail.error.code) {
    details.error_code = compactString(detail.error.code);
  }

  if (detail.error.headerName) {
    details.header_name = compactString(detail.error.headerName);
  }

  if (detail.context) {
    Object.keys(SAFE_CONTEXT_KEYS).forEach((contextKey) => {
      const value = detail.context?.[contextKey];

      if (typeof value === "undefined" || value === null) {
        return;
      }

      const payloadKey = SAFE_CONTEXT_KEYS[contextKey];
      details[payloadKey] =
        typeof value === "string" ? compactString(value) : value;
    });
  }

  return Object.keys(details).length > 0 ? details : null;
};

export const createPunkuChatErrorDetail = ({
  error,
  phase,
  widgetId = "punku-chat-widget",
  flowId,
  hostUrl,
  sessionId,
  context,
}: CreatePunkuChatErrorDetailOptions): PunkuChatErrorDetail => {
  const detail: PunkuChatErrorDetail = {
    event: PUNKU_CHAT_ERROR_EVENT,
    phase,
    widgetId,
    timestamp: new Date().toISOString(),
    error: normalizeClientError(error),
  };

  if (flowId) detail.flowId = flowId;
  if (hostUrl) detail.hostUrl = hostUrl;
  if (sessionId) detail.sessionId = sessionId;
  if (context) {
    const compactContext = removeUndefinedProperties(context);
    if (Object.keys(compactContext).length > 0) {
      detail.context = compactContext;
    }
  }

  return detail;
};

export const createPunkuChatErrorReportPayload = (
  detail: PunkuChatErrorDetail,
  options: CreatePunkuChatErrorReportPayloadOptions = {},
): PunkuChatClientErrorReportPayload => ({
  message: truncateString(
    detail.error.message || "Unknown client error",
    MAX_MESSAGE_LENGTH,
  ),
  flow_id: detail.flowId || null,
  widget_id: detail.widgetId || null,
  session_id: detail.sessionId || null,
  error_type: detail.error.code || detail.error.name || null,
  status_code:
    typeof detail.error.status === "number" ? detail.error.status : null,
  page_url: getPageUrl(options.pageUrl),
  run_url: getRunUrl(detail),
  host_url: cleanBaseUrlWithoutQueryOrHash(detail.hostUrl),
  stack: compactString(detail.error.stack, MAX_STACK_LENGTH),
  details: getSafeDetails(detail),
});

export const dispatchPunkuChatError = (
  detail: PunkuChatErrorDetail,
  target?: EventTarget,
) => {
  const eventTarget =
    target || (typeof window !== "undefined" ? window : undefined);

  if (!eventTarget || typeof CustomEvent === "undefined") {
    return false;
  }

  eventTarget.dispatchEvent(
    new CustomEvent<PunkuChatErrorDetail>(PUNKU_CHAT_ERROR_EVENT, {
      detail,
    }),
  );
  return true;
};

export const getDefaultClientErrorReportUrl = (hostUrl?: string) => {
  if (!hostUrl || typeof hostUrl !== "string") {
    return undefined;
  }

  return `${hostUrl.replace(/\/+$/, "")}${REPORTING_PATH}`;
};

export const reportPunkuChatError = (
  detail: PunkuChatErrorDetail,
  reportUrl?: string,
) => {
  if (!reportUrl || typeof reportUrl !== "string") {
    return false;
  }

  try {
    const payload = JSON.stringify(createPunkuChatErrorReportPayload(detail));

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      typeof Blob !== "undefined"
    ) {
      const sent = navigator.sendBeacon(
        reportUrl,
        new Blob([payload], { type: "application/json" }),
      );

      if (sent) {
        return true;
      }
    }

    if (typeof fetch === "function") {
      fetch(reportUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Reporting must never create another widget error path.
      });
      return true;
    }
  } catch {
    return false;
  }

  return false;
};
