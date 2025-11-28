import { sendMessage, streamMessage, sendFeedback } from './index';
import axios from 'axios';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('sendMessage', () => {
  const baseUrl = 'http://localhost:3000';
  const flowId = 'test-flow-id';
  const message = 'Hello, world!';
  const input_type = 'chat';
  const output_type = 'chat';
  const sessionId = { current: 'test-session-id' } as React.MutableRefObject<string>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send a message successfully', async () => {
    const mockResponse = {
      outputs: [{ outputs: { message: { text: 'Hello back!' } } }]
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve(mockResponse)
    });

    const result = await sendMessage(
      baseUrl,
      flowId,
      message,
      input_type,
      output_type,
      sessionId
    );

    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/run/${flowId}`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String)
      })
    );

    expect(result.status).toBe(200);
    expect(result.data).toEqual(mockResponse);
  });

  it('should include session ID in request when available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({})
    });

    await sendMessage(baseUrl, flowId, message, input_type, output_type, sessionId);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(calledBody.session_id).toBe('test-session-id');
  });

  it('should include API key in headers when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({})
    });

    await sendMessage(
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
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({})
    });

    await sendMessage(
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

  it('should include tweaks in request when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({})
    });

    const tweaks = { component_id: { param: 'value' } };
    await sendMessage(
      baseUrl,
      flowId,
      message,
      input_type,
      output_type,
      sessionId,
      undefined,
      tweaks
    );

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(calledBody.tweaks).toEqual(tweaks);
  });

  it('should include output_component in request when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({})
    });

    await sendMessage(
      baseUrl,
      flowId,
      message,
      input_type,
      output_type,
      sessionId,
      'chat_output'
    );

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(calledBody.output_component).toBe('chat_output');
  });

  it('should throw error on HTTP error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    await expect(
      sendMessage(baseUrl, flowId, message, input_type, output_type, sessionId)
    ).rejects.toThrow('HTTP error! status: 500');
  });

  it('should not include session_id when session is empty', async () => {
    const emptySessionId = { current: '' } as React.MutableRefObject<string>;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: () => Promise.resolve({})
    });

    await sendMessage(baseUrl, flowId, message, input_type, output_type, emptySessionId);

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(calledBody.session_id).toBeUndefined();
  });
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

  it('should call onStreamError on HTTP error', async () => {
    const onStreamError = jest.fn();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error')
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
    ).rejects.toThrow();

    expect(onStreamError).toHaveBeenCalled();
  });

  it('should throw error when stream is not supported', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: null
    });

    await expect(
      streamMessage(baseUrl, flowId, message, input_type, output_type, sessionId)
    ).rejects.toThrow('Stream not supported');
  });

  it('should include stream=true in URL', async () => {
    const mockReader = {
      read: jest.fn().mockResolvedValue({ done: true, value: undefined })
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => mockReader }
    });

    await streamMessage(baseUrl, flowId, message, input_type, output_type, sessionId);

    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/run/${flowId}?stream=true`,
      expect.any(Object)
    );
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
    (axios.put as jest.Mock).mockReset();
  });

  it('should send positive feedback successfully', async () => {
    (axios.put as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await sendFeedback(baseUrl, messageId, 'positive');

    expect(axios.put).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/monitor/messages/${messageId}`,
      { properties: { positive_feedback: true } },
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' }
      })
    );
  });

  it('should send negative feedback successfully', async () => {
    (axios.put as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await sendFeedback(baseUrl, messageId, 'negative');

    expect(axios.put).toHaveBeenCalledWith(
      `${baseUrl}/api/v1/monitor/messages/${messageId}`,
      { properties: { positive_feedback: false } },
      expect.any(Object)
    );
  });

  it('should include API key in headers when provided', async () => {
    (axios.put as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await sendFeedback(baseUrl, messageId, 'positive', 'test-api-key');

    expect(axios.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key'
        })
      })
    );
  });

  it('should include additional headers when provided', async () => {
    (axios.put as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await sendFeedback(
      baseUrl,
      messageId,
      'positive',
      undefined,
      { 'X-Custom-Header': 'custom-value' }
    );

    expect(axios.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Header': 'custom-value'
        })
      })
    );
  });
});
