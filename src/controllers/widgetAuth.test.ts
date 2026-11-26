import { sendFeedback, sendMessage, streamMessage } from './index';
import { isWidgetNotAllowed, resetWidgetAuthForTests, usablePublishableKey, WIDGET_TOKEN_HEADER } from './widgetAuth';
import { SessionStorage } from '../utils/sessionStorage';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const HOST = 'https://api.example.com';
const FLOW = 'your-flow-id';
const PUBLIC_KEY = 'pk_' + 'b'.repeat(32);
const OLD_KEY = 'sk-' + 'c'.repeat(24);
const HOUR = 3600;

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  headers: new Headers(),
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

const tokenAnswer = (token: string, sessionId: string, expiresIn = HOUR) =>
  json(200, { token, session_id: sessionId, expires_at: Math.floor(Date.now() / 1000) + expiresIn, expires_in: expiresIn });

const runAnswer = () => json(200, { outputs: [] });

const calls = () => mockFetch.mock.calls.map(([url, init]) => ({
  url: String(url),
  headers: (init?.headers ?? {}) as Record<string, string>,
  body: init?.body ? JSON.parse(init.body) : undefined,
  credentials: init?.credentials,
}));

const send = (sessionId: { current: string }, credentials: { publicKey?: string; apiKey?: string }) =>
  sendMessage(HOST, FLOW, 'Hello', 'chat', 'chat', sessionId, undefined, undefined, credentials.apiKey, undefined, credentials.publicKey);

describe('visitor token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetWidgetAuthForTests();
    jest.spyOn(SessionStorage, 'updateSessionId').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('trades the public key for a token and runs the chat with the token only', async () => {
    const sessionId = { current: 'stored-session' };
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.one', 'stored-session'));
    mockFetch.mockResolvedValueOnce(runAnswer());

    await send(sessionId, { publicKey: PUBLIC_KEY });

    const [exchange, run] = calls();
    expect(exchange.url).toBe(`${HOST}/api/v1/widget/sessions`);
    expect(exchange.body).toEqual({ flow_id: FLOW, publishable_key: PUBLIC_KEY, session_id: 'stored-session' });
    expect(exchange.headers).not.toHaveProperty('x-api-key');
    expect(exchange.credentials).toBe('omit');
    expect(run.url).toBe(`${HOST}/api/v1/run/${FLOW}`);
    expect(run.headers[WIDGET_TOKEN_HEADER]).toBe('wt1.token.one');
    expect(run.headers).not.toHaveProperty('x-api-key');
  });

  it("sends the page's extra headers with the token request, as with the run", async () => {
    const sessionId = { current: 'stored-session' };
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.one', 'stored-session'));
    mockFetch.mockResolvedValueOnce(runAnswer());

    await sendMessage(
      HOST, FLOW, 'Hello', 'chat', 'chat', sessionId, undefined, undefined, OLD_KEY, { 'x-gateway': 'allowed' }
    );

    const [exchange, run] = calls();
    expect(exchange.url).toBe(`${HOST}/api/v1/widget/sessions`);
    expect(exchange.headers['x-gateway']).toBe('allowed');
    expect(exchange.headers['x-api-key']).toBe(OLD_KEY);
    expect(run.headers['x-gateway']).toBe('allowed');
    expect(run.headers[WIDGET_TOKEN_HEADER]).toBe('wt1.token.one');
  });

  it('counts only a pk_ value as a public key', () => {
    expect(usablePublishableKey(PUBLIC_KEY)).toBe(PUBLIC_KEY);
    for (const value of [OLD_KEY, 'pk_short', 'pk_' + 'b'.repeat(16) + '!', '', undefined, 42]) {
      expect(usablePublishableKey(value)).toBeUndefined();
    }
  });

  it('ignores an API key in publishable_key and trades api_key, then sends it directly on a server without the route', async () => {
    const sessionId = { current: 'stored-session' };
    mockFetch.mockResolvedValueOnce(json(405, { detail: 'Method Not Allowed' }));
    mockFetch.mockResolvedValueOnce(runAnswer());

    await send(sessionId, { apiKey: OLD_KEY, publicKey: OLD_KEY });

    const [exchange, run] = calls();
    expect(exchange.url).toBe(`${HOST}/api/v1/widget/sessions`);
    expect(exchange.body).not.toHaveProperty('publishable_key');
    expect(exchange.headers['x-api-key']).toBe(OLD_KEY);
    expect(run.headers['x-api-key']).toBe(OLD_KEY);
    expect(run.headers).not.toHaveProperty(WIDGET_TOKEN_HEADER);
  });

  it('stores the session that the server gives and sends it with the run', async () => {
    const sessionId = { current: 'client-made-id' };
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.one', 'ws1.server.made'));
    mockFetch.mockResolvedValueOnce(runAnswer());

    await send(sessionId, { publicKey: PUBLIC_KEY });

    expect(sessionId.current).toBe('ws1.server.made');
    expect(SessionStorage.updateSessionId).toHaveBeenCalledWith(FLOW, 'ws1.server.made');
    expect(calls()[1].body.session_id).toBe('ws1.server.made');
  });

  it('keeps the token for the next call of the same session', async () => {
    const sessionId = { current: 'stored-session' };
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.one', 'stored-session'));
    mockFetch.mockResolvedValueOnce(runAnswer());
    mockFetch.mockResolvedValueOnce(runAnswer());

    await send(sessionId, { publicKey: PUBLIC_KEY });
    await send(sessionId, { publicKey: PUBLIC_KEY });

    expect(calls().map((call) => call.url)).toEqual([
      `${HOST}/api/v1/widget/sessions`,
      `${HOST}/api/v1/run/${FLOW}`,
      `${HOST}/api/v1/run/${FLOW}`,
    ]);
  });

  it('gets a new token for a new chat session and before the old one expires', async () => {
    const sessionId = { current: 'first-session' };
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.one', 'first-session', 30));
    mockFetch.mockResolvedValueOnce(runAnswer());
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.two', 'first-session'));
    mockFetch.mockResolvedValueOnce(runAnswer());
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.three', 'second-session'));
    mockFetch.mockResolvedValueOnce(runAnswer());

    await send(sessionId, { publicKey: PUBLIC_KEY });
    // The first token expires in 30 s, inside the refresh margin.
    await send(sessionId, { publicKey: PUBLIC_KEY });
    sessionId.current = 'second-session';
    await send(sessionId, { publicKey: PUBLIC_KEY });

    const runs = calls().filter((call) => call.url.includes('/run/'));
    expect(runs.map((call) => call.headers[WIDGET_TOKEN_HEADER])).toEqual([
      'wt1.token.one',
      'wt1.token.two',
      'wt1.token.three',
    ]);
  });

  it('gets a new token once when the server refuses the token, and does not loop', async () => {
    const sessionId = { current: 'stored-session' };
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.one', 'stored-session'));
    mockFetch.mockResolvedValueOnce(json(401, { detail: 'widget_token_revoked' }));
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.two', 'stored-session'));
    mockFetch.mockResolvedValueOnce(runAnswer());

    await send(sessionId, { publicKey: PUBLIC_KEY });

    const runs = calls().filter((call) => call.url.includes('/run/'));
    expect(runs.map((call) => call.headers[WIDGET_TOKEN_HEADER])).toEqual(['wt1.token.one', 'wt1.token.two']);

    jest.clearAllMocks();
    resetWidgetAuthForTests();
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.one', 'stored-session'));
    mockFetch.mockResolvedValueOnce(json(401, { detail: 'widget_token_revoked' }));
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.two', 'stored-session'));
    mockFetch.mockResolvedValueOnce(json(401, { detail: 'widget_token_revoked' }));

    await expect(send(sessionId, { publicKey: PUBLIC_KEY })).rejects.toThrow('status: 401');
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('trades the widget key of an old embed code in a header, never in the body', async () => {
    const sessionId = { current: 'stored-session' };
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.one', 'stored-session'));
    mockFetch.mockResolvedValueOnce(runAnswer());

    await send(sessionId, { apiKey: OLD_KEY });

    const [exchange, run] = calls();
    expect(exchange.headers['x-api-key']).toBe(OLD_KEY);
    expect(exchange.body).toEqual({ flow_id: FLOW, session_id: 'stored-session' });
    expect(run.headers[WIDGET_TOKEN_HEADER]).toBe('wt1.token.one');
    expect(run.headers).not.toHaveProperty('x-api-key');
  });

  it.each([
    [404, { detail: 'Not Found' }],
    [405, { detail: 'Method Not Allowed' }],
    [403, { detail: 'widget_not_available' }],
  ])('an old embed code sends its key directly when the server answers %s, and asks only once', async (status, body) => {
    const sessionId = { current: 'stored-session' };
    mockFetch.mockResolvedValueOnce(json(status, body));
    mockFetch.mockResolvedValueOnce(runAnswer());
    mockFetch.mockResolvedValueOnce(runAnswer());

    await send(sessionId, { apiKey: OLD_KEY });
    await send(sessionId, { apiKey: OLD_KEY });

    const runs = calls().filter((call) => call.url.includes('/run/'));
    expect(calls()).toHaveLength(3);
    expect(runs.map((call) => call.headers['x-api-key'])).toEqual([OLD_KEY, OLD_KEY]);
  });

  it('an old embed code sends its key directly when the token request cannot reach the server', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mockFetch.mockResolvedValueOnce(runAnswer());

    await send({ current: 'stored-session' }, { apiKey: OLD_KEY });

    expect(calls()[1].headers['x-api-key']).toBe(OLD_KEY);
  });

  it('a public key reports a token request that cannot reach the server', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(send({ current: 'stored-session' }, { publicKey: PUBLIC_KEY })).rejects.toThrow('Failed to fetch');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([{ publicKey: PUBLIC_KEY }, { apiKey: OLD_KEY }])(
    'a website that the owner did not allow gets the not-allowed error and no fallback (%o)',
    async (credentials) => {
      mockFetch.mockResolvedValueOnce(json(403, { detail: 'widget_origin_not_allowed' }));

      const error = await send({ current: 'stored-session' }, credentials).catch((caught) => caught);

      expect(isWidgetNotAllowed(error)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    }
  );

  it('a public key never falls back: a server without the route is an error', async () => {
    mockFetch.mockResolvedValueOnce(json(404, { detail: 'Not Found' }));

    await expect(send({ current: 'stored-session' }, { publicKey: PUBLIC_KEY })).rejects.toThrow('status: 404');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('a widget without a key sends no token request', async () => {
    mockFetch.mockResolvedValueOnce(runAnswer());

    await send({ current: 'stored-session' }, {});

    expect(calls().map((call) => call.url)).toEqual([`${HOST}/api/v1/run/${FLOW}`]);
  });

  it('streams with the token', async () => {
    const encoder = new TextEncoder();
    const chunks = [encoder.encode('{"event":"end","data":{}}\n')];
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.one', 'stored-session'));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => ({ read: () => Promise.resolve(chunks.length ? { done: false, value: chunks.shift() } : { done: true }) }) },
    });

    await streamMessage(
      HOST, FLOW, 'Hello', 'chat', 'chat', { current: 'stored-session' }, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, PUBLIC_KEY
    );

    expect(calls()[1].url).toBe(`${HOST}/api/v1/run/${FLOW}?stream=true`);
    expect(calls()[1].headers[WIDGET_TOKEN_HEADER]).toBe('wt1.token.one');
  });

  it('rates an answer with the token of its session', async () => {
    const sessionId = { current: 'stored-session' };
    mockFetch.mockResolvedValueOnce(tokenAnswer('wt1.token.one', 'stored-session'));
    mockFetch.mockResolvedValueOnce(json(200, { id: 'm1', properties: { positive_feedback: true } }));

    await sendFeedback(HOST, 'm1', 'positive', undefined, undefined, {
      flowId: FLOW,
      sessionId,
      publishableKey: PUBLIC_KEY,
    });

    const feedback = calls()[1];
    expect(feedback.url).toBe(`${HOST}/api/v1/monitor/messages/m1`);
    expect(feedback.headers[WIDGET_TOKEN_HEADER]).toBe('wt1.token.one');
  });
});
