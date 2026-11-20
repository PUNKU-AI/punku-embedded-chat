import { applyLook, FIRST_LOOK_WAIT_MS, fetchLook, LOOK_ATTRIBUTES, readCachedLook, writeCachedLook } from './liveLook';

const HOST = 'https://api.example.com';
const FLOW = 'your-flow-id';
const PUBLIC_KEY = 'pk_' + 'b'.repeat(32);
const CONNECTED = Symbol.for('r2wc.connected');

const mockFetch = jest.fn();
global.fetch = mockFetch;

const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('live look', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('applies only look attributes that the page did not set', () => {
    const element = document.createElement('div');
    element.setAttribute('button_color', '#000000');

    applyLook(
      element,
      { window_title: 'Lena', button_color: '#FFFFFF', api_key: 'sk-x', host_url: 'https://evil.example', flow_id: 'x' },
      new Set(['button_color'])
    );

    expect(element.getAttribute('window_title')).toBe('Lena');
    expect(element.getAttribute('button_color')).toBe('#000000');
    for (const name of ['api_key', 'host_url', 'flow_id']) {
      expect(element.hasAttribute(name)).toBe(false);
    }
  });

  it('never lets the look set a credential, the host, the flow or the request options', () => {
    for (const name of ['api_key', 'publishable_key', 'host_url', 'flow_id', 'session_id', 'tweaks', 'additional_headers',
      'input_type', 'output_type', 'output_component', 'widget_id', 'client_error_report_url']) {
      expect(LOOK_ATTRIBUTES.has(name)).toBe(false);
    }
  });

  it('reads the look, a hidden widget and a server without the route', async () => {
    mockFetch.mockResolvedValueOnce(answer(200, { attributes: { window_title: 'Lena', api_key: 'sk-x' } }));
    mockFetch.mockResolvedValueOnce(answer(404, { detail: 'widget_not_available' }));
    mockFetch.mockResolvedValueOnce(answer(404, { detail: 'Not Found' }));
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    expect(await fetchLook(HOST, FLOW, PUBLIC_KEY)).toEqual({ window_title: 'Lena' });
    expect(await fetchLook(HOST, FLOW, PUBLIC_KEY)).toBe('hidden');
    expect(await fetchLook(HOST, FLOW, PUBLIC_KEY)).toBeNull();
    expect(await fetchLook(HOST, FLOW, PUBLIC_KEY)).toBeNull();
    expect(mockFetch.mock.calls[0][0]).toBe(
      `${HOST}/api/v1/widget/config?flow_id=${FLOW}&publishable_key=${PUBLIC_KEY}`
    );
    expect(mockFetch.mock.calls[0][1]).toEqual({ credentials: 'omit' });
  });

  it('keeps the last look for the next page', () => {
    writeCachedLook(HOST, FLOW, { window_title: 'Lena' });

    expect(readCachedLook(HOST, FLOW)).toEqual({ window_title: 'Lena' });
    expect(readCachedLook(HOST, 'another-flow')).toBeNull();
  });
});

describe('punku-chat with a public key', () => {
  beforeAll(async () => {
    await import('./index');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
    mockFetch.mockImplementation(() => Promise.resolve(answer(404, { detail: 'Not Found' })));
  });

  const element = (attributes: Record<string, string>) => {
    const chat = document.createElement('punku-chat');
    for (const [name, value] of Object.entries(attributes)) {
      chat.setAttribute(name, value);
    }
    return chat as HTMLElement;
  };

  const lookRequests = () =>
    mockFetch.mock.calls.filter(([url]) => String(url).includes('/api/v1/widget/config')).length;

  it('shows the saved look on the first page, and the page attributes win', async () => {
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/api/v1/widget/config')
          ? answer(200, { attributes: { window_title: 'Lena', button_color: '#FFFFFF', start_open: 'false' } })
          : answer(404, { detail: 'Not Found' })
      )
    );
    const chat = element({ host_url: HOST, flow_id: FLOW, publishable_key: PUBLIC_KEY, button_color: '#000000' });

    document.body.appendChild(chat);
    // Invisible and inert until the look is there, so the default look does not flash.
    expect(chat.style.opacity).toBe('0');
    expect(chat.style.pointerEvents).toBe('none');
    await settle();

    expect(chat.getAttribute('window_title')).toBe('Lena');
    expect(chat.getAttribute('start_open')).toBe('false');
    expect(chat.getAttribute('button_color')).toBe('#000000');
    // The widget starts again once, so settings that it reads only at start apply too.
    expect(chat.getAttribute('look_revision')).toBe('1');
    expect(chat.style.opacity).toBe('');
    expect(chat.style.pointerEvents).toBe('');
    expect(readCachedLook(HOST, FLOW)).toEqual({ window_title: 'Lena', button_color: '#FFFFFF', start_open: 'false' });
  });

  it('shows a returning visitor the stored look at once', () => {
    writeCachedLook(HOST, FLOW, { window_title: 'Stored title' });
    mockFetch.mockImplementation(() => new Promise(() => undefined));
    const chat = element({ host_url: HOST, flow_id: FLOW, publishable_key: PUBLIC_KEY });

    document.body.appendChild(chat);

    expect(chat.getAttribute('window_title')).toBe('Stored title');
    expect(chat.style.opacity).toBe('');
  });

  it('starts the widget again only when the look changed', async () => {
    writeCachedLook(HOST, FLOW, { window_title: 'Lena' });
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/api/v1/widget/config')
          ? answer(200, { attributes: { window_title: 'Lena' } })
          : answer(404, { detail: 'Not Found' })
      )
    );
    const chat = element({ host_url: HOST, flow_id: FLOW, publishable_key: PUBLIC_KEY });

    document.body.appendChild(chat);
    await settle();

    expect(chat.getAttribute('look_revision')).toBe('1');
  });

  it('shows the widget after a short wait when the look does not come', () => {
    jest.useFakeTimers();
    try {
      mockFetch.mockImplementation(() => new Promise(() => undefined));
      const chat = element({ host_url: HOST, flow_id: FLOW, publishable_key: PUBLIC_KEY });

      document.body.appendChild(chat);
      expect(chat.style.opacity).toBe('0');
      jest.advanceTimersByTime(FIRST_LOOK_WAIT_MS);

      expect(chat.style.opacity).toBe('');
      expect(chat.style.pointerEvents).toBe('');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows no widget for a rotated key', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeCachedLook(HOST, FLOW, { window_title: 'Old title' });
    mockFetch.mockImplementation(() => Promise.resolve(answer(404, { detail: 'widget_not_available' })));
    const chat = element({ host_url: HOST, flow_id: FLOW, publishable_key: PUBLIC_KEY });

    document.body.appendChild(chat);
    await settle();

    expect(chat.style.display).toBe('none');
    expect(readCachedLook(HOST, FLOW)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('an embed code without a public key reads no look and is never hidden', () => {
    const chat = element({ host_url: HOST, flow_id: FLOW, api_key: 'sk-' + 'c'.repeat(24) });

    document.body.appendChild(chat);

    expect(lookRequests()).toBe(0);
    expect(chat.style.opacity).toBe('');
  });
});
