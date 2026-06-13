import { streamMessage, sendFeedback } from './index';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

const doneReader = () => ({
  read: jest.fn().mockResolvedValue({ done: true, value: undefined })
});

describe('streamMessage', () => {
  const baseUrl = 'http://localhost:3000';
  const flowId = 'test-flow-id';
  const message = 'Hello, world!';
  const input_type = 'chat';
  const output_type = 'chat';
  const sessionId = { current: 'test-session-id' } as React.MutableRefObject<string>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should stream messages successfully', async () => {
    const onStreamData = jest.fn();
    const onStreamEnd = jest.fn();

    const mockReader = {
      read: jest.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('{"message": "Hello"}\n')
        })
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('[DONE]\n')
        })
        .mockResolvedValueOnce({ done: true, value: undefined })
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader }
    });

    await streamMessage(
      baseUrl,
      flowId,
      message,
      input_type,
      output_type,
      sessionId,
      undefined,
      undefined,
      undefined,
      undefined,
      onStreamData,
      onStreamEnd
    );

    expect(onStreamData).toHaveBeenCalledWith({ message: 'Hello' });
    expect(onStreamEnd).toHaveBeenCalled();
  });

  it('should include stream=true in URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => doneReader() }
    });

    await streamMessage(baseUrl, flowId, message, input_type, output_type, sessionId);

    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/run/${flowId}?stream=true`,
      expect.any(Object)
    );
  });

  it('should include session ID in request when available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => doneReader() }
    });

    await streamMessage(baseUrl, flowId, message, input_type, output_type, sessionId);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(calledBody.session_id).toBe('test-session-id');
  });

  it('should not include session_id when session is empty', async () => {
    const emptySessionId = { current: '' } as React.MutableRefObject<string>;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => doneReader() }
    });

    await streamMessage(baseUrl, flowId, message, input_type, output_type, emptySessionId);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(calledBody.session_id).toBeUndefined();
  });

  it('should include API key in headers when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => doneReader() }
    });

    await streamMessage(
      baseUrl,
      flowId,
      message,
      input_type,
      output_type,
      sessionId,
      undefined,
      undefined,
      'test-api-key'
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key'
        })
      })
    );
  });

  it('should include additional headers when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => doneReader() }
    });

    await streamMessage(
      baseUrl,
      flowId,
      message,
      input_type,
      output_type,
      sessionId,
      undefined,
      undefined,
      undefined,
      { 'X-Custom-Header': 'custom-value' }
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Header': 'custom-value'
        })
      })
    );
  });

  it('should include tweaks and output_component in request when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => doneReader() }
    });

    const tweaks = { component_id: { param: 'value' } };
    await streamMessage(
      baseUrl,
      flowId,
      message,
      input_type,
      output_type,
      sessionId,
      'chat_output',
      tweaks
    );

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(calledBody.tweaks).toEqual(tweaks);
    expect(calledBody.output_component).toBe('chat_output');
  });

  it('should call onStreamError on HTTP error without rejecting', async () => {
    const onStreamError = jest.fn();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error')
    });

    // The error is surfaced via the callback only; the promise must resolve so
    // a fire-and-forget caller never produces an unhandled rejection.
    await expect(
      streamMessage(
        baseUrl,
        flowId,
        message,
        input_type,
        output_type,
        sessionId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        onStreamError
      )
    ).resolves.toBeUndefined();

    expect(onStreamError).toHaveBeenCalled();
  });

  it('should call onStreamError when stream is not supported without rejecting', async () => {
    const onStreamError = jest.fn();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: null
    });

    await expect(
      streamMessage(
        baseUrl,
        flowId,
        message,
        input_type,
        output_type,
        sessionId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        onStreamError
      )
    ).resolves.toBeUndefined();

    expect(onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Stream not supported' })
    );
  });

  it('should skip malformed JSON lines and keep streaming', async () => {
    const onStreamData = jest.fn();
    const onStreamEnd = jest.fn();
    const onStreamError = jest.fn();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const mockReader = {
      read: jest.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('not-json\n{"message": "Hello"}\n')
        })
        .mockResolvedValueOnce({ done: true, value: undefined })
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader }
    });

    await streamMessage(
      baseUrl,
      flowId,
      message,
      input_type,
      output_type,
      sessionId,
      undefined,
      undefined,
      undefined,
      undefined,
      onStreamData,
      onStreamEnd,
      onStreamError
    );

    expect(onStreamData).toHaveBeenCalledWith({ message: 'Hello' });
    expect(onStreamEnd).toHaveBeenCalled();
    expect(onStreamError).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should handle empty lines gracefully', async () => {
    const onStreamData = jest.fn();
    const onStreamEnd = jest.fn();

    const mockReader = {
      read: jest.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('\n\n{"message": "Hello"}\n\n')
        })
        .mockResolvedValueOnce({ done: true, value: undefined })
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader }
    });

    await streamMessage(
      baseUrl,
      flowId,
      message,
      input_type,
      output_type,
      sessionId,
      undefined,
      undefined,
      undefined,
      undefined,
      onStreamData,
      onStreamEnd
    );

    expect(onStreamData).toHaveBeenCalledWith({ message: 'Hello' });
  });
});

describe('sendFeedback', () => {
  const baseUrl = 'http://localhost:3000';
  const messageId = 'test-message-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const okResponse = () => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true })
  });

  it('should send positive feedback successfully', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());

    await sendFeedback(baseUrl, messageId, 'positive');

    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/monitor/messages/${messageId}`,
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { positive_feedback: true } })
      })
    );
  });

  it('should send negative feedback successfully', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());

    await sendFeedback(baseUrl, messageId, 'negative');

    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/monitor/messages/${messageId}`,
      expect.objectContaining({
        body: JSON.stringify({ properties: { positive_feedback: false } })
      })
    );
  });

  it('should include API key in headers when provided', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());

    await sendFeedback(baseUrl, messageId, 'positive', 'test-api-key');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key'
        })
      })
    );
  });

  it('should include additional headers when provided', async () => {
    mockFetch.mockResolvedValueOnce(okResponse());

    await sendFeedback(
      baseUrl,
      messageId,
      'positive',
      undefined,
      { 'X-Custom-Header': 'custom-value' }
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Header': 'custom-value'
        })
      })
    );
  });

  it('should throw on HTTP error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve(null)
    });

    await expect(sendFeedback(baseUrl, messageId, 'positive')).rejects.toThrow(
      'HTTP error! status: 500'
    );
  });
});
