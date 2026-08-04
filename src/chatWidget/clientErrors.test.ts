import {
  createPunkuChatErrorDetail,
  createPunkuChatErrorReportPayload,
  getDefaultClientErrorReportUrl,
  reportPunkuChatError,
} from "./clientErrors";

describe("client error reporting", () => {
  const originalFetch = global.fetch;
  const originalSendBeacon = navigator.sendBeacon;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as { fetch?: typeof fetch }).fetch;
    }

    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: originalSendBeacon,
    });
  });

  it("builds a default reporting URL from host_url", () => {
    expect(getDefaultClientErrorReportUrl("https://api.example.com/")).toBe(
      "https://api.example.com/api/v1/widget/client-errors",
    );
  });

  it("builds the platform client error payload without sensitive request data", () => {
    const error = Object.assign(new Error("Failed to read headers"), {
      code: "ERR_INVALID_REQUEST_HEADER",
      headerName: "X-Custom-Header",
    });
    const detail = createPunkuChatErrorDetail({
      error,
      phase: "stream-message",
      widgetId: "custom-widget",
      flowId: "flow-id",
      hostUrl: "https://api.example.com/",
      sessionId: "session-id",
      context: {
        inputType: "chat",
        messageLength: 5,
        streaming: true,
        authorization: "Bearer secret",
      },
    });

    const payload = createPunkuChatErrorReportPayload(detail, {
      pageUrl: "https://customer.example.com/chat?token=secret#debug",
    });

    expect(payload).toEqual(
      expect.objectContaining({
        message: "Failed to read headers",
        flow_id: "flow-id",
        widget_id: "custom-widget",
        session_id: "session-id",
        error_type: "ERR_INVALID_REQUEST_HEADER",
        status_code: null,
        page_url: "https://customer.example.com/chat",
        run_url: "https://api.example.com/api/v1/run/flow-id",
        host_url: "https://api.example.com",
        stack: expect.any(String),
      }),
    );
    expect(payload.details).toEqual(
      expect.objectContaining({
        phase: "stream-message",
        classification: "invalid_request_header",
        error_code: "ERR_INVALID_REQUEST_HEADER",
        header_name: "X-Custom-Header",
        input_type: "chat",
        message_length: 5,
        streaming: true,
      }),
    );
    expect(payload.details).not.toHaveProperty("authorization");
  });

  it("keeps response bodies out of reported HTTP error messages", () => {
    const detail = createPunkuChatErrorDetail({
      error: new Error("HTTP error! status: 500, body: sensitive body"),
      phase: "send-message",
      flowId: "flow-id",
      hostUrl: "https://api.example.com",
    });

    const payload = createPunkuChatErrorReportPayload(detail);

    expect(payload.message).toBe("HTTP error! status: 500");
    expect(payload.stack).not.toContain("sensitive body");
    expect(payload.status_code).toBe(500);
    expect(payload.details).toEqual(
      expect.objectContaining({
        classification: "http",
      })
    );
  });

  it("reports client errors with sendBeacon when available", () => {
    const detail = createPunkuChatErrorDetail({
      error: new Error("Client failure"),
      phase: "stream-message",
      widgetId: "custom-widget",
      flowId: "flow-id",
      hostUrl: "https://api.example.com",
    });
    const sendBeacon = jest.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });

    expect(reportPunkuChatError(detail, "https://api.example.com/errors")).toBe(
      true,
    );
    expect(sendBeacon).toHaveBeenCalledWith(
      "https://api.example.com/errors",
      expect.any(Blob),
    );
  });

  it("falls back to fetch with keepalive when sendBeacon is unavailable", () => {
    const detail = createPunkuChatErrorDetail({
      error: new Error("Client failure"),
      phase: "send-message",
    });
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: undefined,
    });
    const fetchMock = jest.fn<
      Promise<Response>,
      [RequestInfo | URL, RequestInit?]
    >(() => Promise.resolve({ ok: true } as Response));
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(reportPunkuChatError(detail, "https://api.example.com/errors")).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/errors",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
        keepalive: true,
      }),
    );
    const reportRequest = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(reportRequest.body as string)).toEqual(
      expect.objectContaining({
        message: "Client failure",
        flow_id: null,
        widget_id: "punku-chat-widget",
        session_id: null,
        error_type: "Error",
        status_code: null,
        run_url: null,
      }),
    );
  });
});
