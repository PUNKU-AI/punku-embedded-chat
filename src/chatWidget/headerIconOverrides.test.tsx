import { act, renderHook, waitFor } from '@testing-library/react';
import { createHash, webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import {
  clearHeaderIconOverridesCache,
  HEADER_ICON_OVERRIDES_URL,
  selectHeaderIconOverride,
  useHeaderIconOverride,
} from './headerIconOverrides';

const context = {
  hostUrl: 'https://api.example.com',
  flowId: 'a1111111-1111-4111-8111-111111111111',
  pageOrigin: 'https://customer.example.com',
};
const headerIcon = 'https://cdn.example.com/customer-logo.svg';
const entry = {
  selector: createHash('sha256')
    .update(JSON.stringify([context.hostUrl, context.flowId, context.pageOrigin]))
    .digest('hex'),
  header_icon: headerIcon,
};
const mockFetch = jest.fn();
const originalFetch = global.fetch;
const originalImage = global.Image;
const originalTextEncoder = global.TextEncoder;
const originalSubtle = Object.getOwnPropertyDescriptor(global.crypto, 'subtle');
let images: MockImage[];

class MockImage {
  src = '';
  complete = false;
  naturalWidth = 0;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor() {
    images.push(this);
  }

  load() {
    this.complete = true;
    this.naturalWidth = 24;
    this.onload?.(new Event('load'));
  }

  fail() {
    this.complete = true;
    this.onerror?.(new Event('error'));
  }
}

function respondWith(body: unknown, ok = true) {
  mockFetch.mockResolvedValue({ ok, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  clearHeaderIconOverridesCache();
  mockFetch.mockReset();
  global.fetch = mockFetch;
  images = [];
  global.Image = MockImage as unknown as typeof Image;
  global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
  Object.defineProperty(global.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
});

afterEach(() => {
  global.fetch = originalFetch;
  global.Image = originalImage;
  global.TextEncoder = originalTextEncoder;
  if (originalSubtle) {
    Object.defineProperty(global.crypto, 'subtle', originalSubtle);
  } else {
    Reflect.deleteProperty(global.crypto, 'subtle');
  }
});

describe('selectHeaderIconOverride', () => {
  it('selects the configured image for the exact backend, flow, and page', async () => {
    expect(await selectHeaderIconOverride([entry], context)).toBe(headerIcon);
    expect(await selectHeaderIconOverride([entry], {
      ...context,
      hostUrl: 'https://api.example.com/api/v1/',
      flowId: context.flowId.toUpperCase(),
      pageOrigin: 'https://customer.example.com/page/',
    })).toBe(headerIcon);
  });

  it.each([
    { flowId: 'a2222222-2222-4222-8222-222222222222' },
    { hostUrl: 'https://other-api.example.com' },
    { hostUrl: 'http://api.example.com' },
    { pageOrigin: 'https://other-customer.example.com' },
    { pageOrigin: 'https://customer.example.com:444' },
  ])('does not change another widget: %j', async (change) => {
    expect(await selectHeaderIconOverride([entry], { ...context, ...change })).toBeUndefined();
  });

  it.each([
    'http://cdn.example.com/customer-logo.svg',
    'javascript:alert(1)', // eslint-disable-line no-script-url -- Rejected URL fixture.
    'data:image/svg+xml,<svg/>',
    '//cdn.example.com/customer-logo.svg',
    'https://user:password@cdn.example.com/customer-logo.svg',
    'https://cdn.example.com/customer-logo.svg?token=value',
    'https://cdn.example.com/customer-logo.svg#logo',
    'not a URL',
  ])('rejects an unsafe image URL: %s', async (url) => {
    expect(await selectHeaderIconOverride([{ ...entry, header_icon: url }], context)).toBeUndefined();
  });

  it.each([
    undefined,
    null,
    {},
    { entries: [entry] },
    [null],
    [headerIcon],
    [{ ...entry, selector: undefined }],
    [{ ...entry, selector: 42 }],
    [{ ...entry, selector: 'invalid-selector' }],
    [{ ...entry, selector: entry.selector.toUpperCase() }],
    [{ ...entry, selector: 'a'.repeat(63) }],
    [{ ...entry, selector: 'g'.repeat(64) }],
    [{ ...entry, flow_id: context.flowId }],
    [{ ...entry, unexpected: true }],
    [{ ...entry, header_icon: 42 }],
  ])('ignores malformed configuration: %j', async (entries) => {
    expect(await selectHeaderIconOverride(entries, context)).toBeUndefined();
  });

  it('keeps the current icon if the browser cannot calculate a selector', async () => {
    Object.defineProperty(global.crypto, 'subtle', { configurable: true, value: undefined });
    expect(await selectHeaderIconOverride([entry], context)).toBeUndefined();
  });

  it('keeps the current icon if selector calculation fails', async () => {
    Object.defineProperty(global.crypto, 'subtle', {
      configurable: true,
      value: { digest: jest.fn().mockRejectedValue(new Error('Digest unavailable')) },
    });
    expect(await selectHeaderIconOverride([entry], context)).toBeUndefined();
  });
});

describe('useHeaderIconOverride', () => {
  it('preserves an explicit image without fetching configuration', () => {
    const explicitIcon = 'https://cdn.example.com/explicit.svg';
    const { result } = renderHook(() => useHeaderIconOverride({ ...context, headerIcon: explicitIcon }));

    expect(result.current.headerIcon).toBe(explicitIcon);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(images).toHaveLength(0);
  });

  it.each([
    { flowId: 'invalid-flow' },
    { hostUrl: 'http://api.example.com' },
    { pageOrigin: 'http://customer.example.com' },
  ])('does not request configuration for an invalid context: %j', (change) => {
    const { result } = renderHook(() => useHeaderIconOverride({ ...context, ...change }));

    expect(result.current.headerIcon).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(images).toHaveLength(0);
  });

  it('shows an override only after the replacement image loads', async () => {
    respondWith([entry]);
    const { result } = renderHook(() => useHeaderIconOverride(context));

    expect(result.current.headerIcon).toBeUndefined();
    await waitFor(() => expect(images).toHaveLength(1));
    expect(images[0].src).toBe(headerIcon);
    expect(result.current.headerIcon).toBeUndefined();

    act(() => images[0].load());
    await waitFor(() => expect(result.current.headerIcon).toBe(headerIcon));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(HEADER_ICON_OVERRIDES_URL);
  });

  it('shares one configuration request across widgets on the page', async () => {
    respondWith([entry]);
    const { result: firstResult } = renderHook(() => useHeaderIconOverride(context));
    const { result: secondResult } = renderHook(() => useHeaderIconOverride({
      ...context,
      flowId: 'a2222222-2222-4222-8222-222222222222',
    }));

    await waitFor(() => expect(images).toHaveLength(1));
    act(() => images[0].load());
    await waitFor(() => expect(firstResult.current.headerIcon).toBe(headerIcon));
    expect(secondResult.current.headerIcon).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['malformed configuration', {}],
    ['no matching entry', []],
    ['an unsafe replacement', [{ ...entry, header_icon: 'http://cdn.example.com/logo.svg' }]],
  ])('keeps the current icon after %s', async (_label, body) => {
    respondWith(body);
    const { result } = renderHook(() => useHeaderIconOverride(context));

    await act(async () => { await Promise.resolve(); });
    expect(result.current.headerIcon).toBeUndefined();
    expect(images).toHaveLength(0);
  });

  it.each(['network', 'HTTP', 'JSON'])('keeps the current icon after a %s failure', async (failure) => {
    if (failure === 'network') {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    } else if (failure === 'HTTP') {
      respondWith([entry], false);
    } else {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.reject(new SyntaxError('Invalid JSON')) });
    }
    const { result } = renderHook(() => useHeaderIconOverride(context));

    await act(async () => { await Promise.resolve(); });
    expect(result.current.headerIcon).toBeUndefined();
    expect(images).toHaveLength(0);
  });

  it('keeps the current icon if the replacement image fails to load', async () => {
    respondWith([entry]);
    const { result } = renderHook(() => useHeaderIconOverride(context));
    await waitFor(() => expect(images).toHaveLength(1));

    act(() => images[0].fail());
    expect(result.current.headerIcon).toBeUndefined();
  });

  it('restores the current icon if the rendered replacement fails', async () => {
    respondWith([entry]);
    const { result } = renderHook(() => useHeaderIconOverride(context));
    await waitFor(() => expect(images).toHaveLength(1));
    act(() => images[0].load());
    await waitFor(() => expect(result.current.headerIcon).toBe(headerIcon));

    act(() => result.current.onImageError());
    expect(result.current.headerIcon).toBeUndefined();
  });

  it('removes the override immediately when the widget context changes', async () => {
    respondWith([entry]);
    const { result, rerender } = renderHook((props) => useHeaderIconOverride(props), { initialProps: context });
    await waitFor(() => expect(images).toHaveLength(1));
    act(() => images[0].load());
    await waitFor(() => expect(result.current.headerIcon).toBe(headerIcon));

    rerender({ ...context, pageOrigin: 'https://other-customer.example.com' });
    expect(result.current.headerIcon).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('ignores a previous image load after the widget context changes', async () => {
    respondWith([entry]);
    const { result, rerender } = renderHook((props) => useHeaderIconOverride(props), { initialProps: context });
    await waitFor(() => expect(images).toHaveLength(1));

    rerender({ ...context, flowId: 'a2222222-2222-4222-8222-222222222222' });
    act(() => images[0].load());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.headerIcon).toBeUndefined();
  });
});
