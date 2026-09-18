/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   The icon is a decorative, aria-hidden <svg>. It has no role and no text, so
   Testing Library queries cannot reach it. */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import LucideCdnIcon, {
  clearLucideIconCache,
  LUCIDE_ICON_BASE_URL,
  normalizeIconName,
  parseIconSvg,
} from './lucideCdnIcon';

const svg = (inner: string) =>
  '<!-- lucide-static v1.47.0 - ISC -->\n' +
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
  `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>\n`;

const BOT_MESSAGE_SQUARE = svg(
  '<path d="M12 6V2H8" /><path d="M15 11v2" /><rect width="16" height="12" x="4" y="8" rx="2" />'
);

const mockFetch = jest.fn();

const respondWith = (body: string, ok = true) =>
  mockFetch.mockResolvedValueOnce({ ok, text: () => Promise.resolve(body) });

beforeEach(() => {
  mockFetch.mockReset();
  (global as any).fetch = mockFetch;
  clearLucideIconCache();
});

describe('normalizeIconName', () => {
  it.each([
    ['MessageSquare', 'messagesquare'],
    ['message-square', 'messagesquare'],
    ['ArrowDown01', 'arrowdown01'],
    ['arrow-down-0-1', 'arrowdown01'],
    ['Grid3x3', 'grid3x3'],
    ['  Bot ', 'bot'],
    ['../../evil', 'evil'],
    [undefined, ''],
  ])('should normalize %j to %j', (input, expected) => {
    expect(normalizeIconName(input as string | undefined)).toBe(expected);
  });
});

describe('parseIconSvg', () => {
  it('should return the shape elements of a Lucide file', () => {
    expect(parseIconSvg(BOT_MESSAGE_SQUARE)).toEqual([
      { tag: 'path', attributes: { d: 'M12 6V2H8' } },
      { tag: 'path', attributes: { d: 'M15 11v2' } },
      { tag: 'rect', attributes: { width: '16', height: '12', x: '4', y: '8', rx: '2' } },
    ]);
  });

  it.each([
    ['a script element', svg('<script>alert(1)</script>')],
    ['a foreignObject element', svg('<foreignObject><div>x</div></foreignObject>')],
    ['an event handler attribute', svg('<path d="M1 1" onload="alert(1)" />')],
    ['a style attribute', svg('<path d="M1 1" style="fill:red" />')],
    ['a url() value', svg('<path d="M1 1" fill="url(#x)" />')],
    ['a javascript: value', svg('<path d="javascript:alert(1)" />')],
    ['an href attribute', svg('<path d="M1 1" href="https://evil.example" />')],
    ['a nested element', svg('<path d="M1 1"><animate attributeName="d" /></path>')],
    ['an empty icon', svg('')],
    ['a root that is not svg', '<html><body><p>Access denied</p></body></html>'],
    ['text that is not XML', 'AccessDenied'],
  ])('should reject %s', (_label, markup) => {
    expect(parseIconSvg(markup)).toBeNull();
  });
});

describe('published icon set', () => {
  // The same sources as scripts/build-lucide-icons.js.
  const fs = require('fs');
  const path = require('path');
  const sources = [
    path.resolve(__dirname, '../../../node_modules/lucide-static/icons'),
    path.resolve(__dirname, '../../../assets/lucide-legacy'),
  ];

  it('should accept every icon file, so no published icon falls back without notice', () => {
    const rejected: string[] = [];
    let count = 0;

    for (const directory of sources) {
      for (const file of fs.readdirSync(directory).filter((name: string) => name.endsWith('.svg'))) {
        count += 1;
        if (!parseIconSvg(fs.readFileSync(path.join(directory, file), 'utf8'))) {
          rejected.push(file);
        }
      }
    }

    expect(count).toBeGreaterThan(2000);
    expect(rejected).toEqual([]);
  });
});

describe('LucideCdnIcon', () => {
  it('should render the default icon with no request when no name is set', () => {
    const { container } = render(<LucideCdnIcon className="cl-header-logo" />);

    expect(container.querySelector('svg.cl-header-logo')).toHaveClass('lucide-messages-square');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(['MessageSquare', 'message-square', 'Bot', 'MountainSnow'])(
    'should render the built-in icon %s with no request',
    (name) => {
      const { container } = render(<LucideCdnIcon name={name} className="cl-header-logo" />);

      const icon = container.querySelector('svg.cl-header-logo');
      expect(icon).toBeInTheDocument();
      expect(icon?.children.length).toBeGreaterThan(0);
      expect(mockFetch).not.toHaveBeenCalled();
    }
  );

  it('should load any other icon from the CDN by its normalized name', async () => {
    respondWith(BOT_MESSAGE_SQUARE);

    const { container } = render(
      <LucideCdnIcon name="BotMessageSquare" className="cl-header-logo" color="#123456" size={24} />
    );

    // Loading: an empty svg keeps the layout, with no flash of the default icon.
    const loadingIcon = container.querySelector('svg.cl-header-logo');
    expect(loadingIcon).toHaveClass('lucide-botmessagesquare');
    expect(loadingIcon?.children).toHaveLength(0);

    await waitFor(() => {
      expect(container.querySelectorAll('svg.cl-header-logo > *')).toHaveLength(3);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(`${LUCIDE_ICON_BASE_URL}/botmessagesquare.svg`, {
      credentials: 'omit',
    });

    const icon = container.querySelector('svg.cl-header-logo');
    expect(icon).toHaveAttribute('stroke', '#123456');
    expect(icon).toHaveAttribute('width', '24');
    expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
    expect(container.querySelector('svg.cl-header-logo > rect')).toHaveAttribute('rx', '2');
  });

  it('should request an icon once for several widgets', async () => {
    respondWith(BOT_MESSAGE_SQUARE);

    const { container } = render(
      <>
        <LucideCdnIcon name="BotMessageSquare" />
        <LucideCdnIcon name="bot-message-square" />
      </>
    );

    await waitFor(() => {
      expect(container.querySelectorAll('svg > *')).toHaveLength(6);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should show the default icon when the CDN does not have the name', async () => {
    respondWith('<Error><Code>AccessDenied</Code></Error>', false);

    const { container } = render(<LucideCdnIcon name="NoSuchIcon" className="cl-header-logo" />);

    await waitFor(() => {
      expect(container.querySelector('svg.cl-header-logo')).toHaveClass('lucide-messages-square');
    });
  });

  it('should show the default icon when the request is blocked', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const { container } = render(<LucideCdnIcon name="Anvil" className="cl-header-logo" />);

    await waitFor(() => {
      expect(container.querySelector('svg.cl-header-logo')).toHaveClass('lucide-messages-square');
    });
  });

  it('should show the default icon when the file contains active content', async () => {
    respondWith(svg('<path d="M1 1" /><script>alert(1)</script>'));

    const { container } = render(<LucideCdnIcon name="Anvil" className="cl-header-logo" />);

    await waitFor(() => {
      expect(container.querySelector('svg.cl-header-logo')).toHaveClass('lucide-messages-square');
    });
    expect(container.querySelector('script')).not.toBeInTheDocument();
  });

  it('should load the new icon when the name changes', async () => {
    respondWith(BOT_MESSAGE_SQUARE);
    respondWith(svg('<circle cx="12" cy="12" r="10" />'));

    const { container, rerender } = render(<LucideCdnIcon name="BotMessageSquare" />);
    await waitFor(() => {
      expect(container.querySelectorAll('svg > *')).toHaveLength(3);
    });

    rerender(<LucideCdnIcon name="Circle" />);
    await waitFor(() => {
      expect(container.querySelectorAll('svg > circle')).toHaveLength(1);
    });
    expect(container.querySelectorAll('svg > *')).toHaveLength(1);
  });
});
