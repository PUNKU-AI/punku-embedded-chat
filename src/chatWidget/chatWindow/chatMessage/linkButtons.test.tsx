import React from 'react';
import { render } from '@testing-library/react';
import ChatMessage, { isCheckoutLinkOnly, isLinkList, isLinkOnly, isLinkOnlyListItem } from './index';

// Real markdown rendering: a link that stands alone in a paragraph or a list
// item gets the cl-link-only class, so the stylesheet draws it as a button.

jest.mock('../../../controllers', () => ({
  sendFeedback: jest.fn(),
}));

const renderAnswer = (message: string) =>
  render(<ChatMessage message={message} isSend={false} message_id="answer" host_url="http://localhost:3000" />);

describe('link buttons in answers', () => {
  it('marks a paragraph that holds only a link', () => {
    renderAnswer('Families get a discount.\n\n[Book family tickets](https://example.com/book)');

    const paragraphs = Array.from(document.querySelectorAll('.markdown-body p'));
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).not.toHaveClass('cl-link-only');
    expect(paragraphs[1]).toHaveClass('cl-link-only');
    expect(paragraphs[1].querySelector('a')).toHaveAttribute('href', 'https://example.com/book');
  });

  it('marks a bold link on its own line', () => {
    renderAnswer('[**Book tickets**](https://example.com/book)');

    expect(document.querySelector('.markdown-body p')).toHaveClass('cl-link-only');
  });

  it('keeps a link inside a sentence inline', () => {
    renderAnswer('Visit [our shop](https://example.com/shop) for tickets.');

    expect(document.querySelector('.markdown-body p')).not.toHaveClass('cl-link-only');
  });

  it('marks list items that hold only a link and keeps the others', () => {
    renderAnswer('- [Prices](https://example.com/prices)\n- [Opening hours](https://example.com/hours)\n- See [the map](https://example.com/map) first');

    const items = Array.from(document.querySelectorAll('.markdown-body li'));
    expect(items.map((item) => item.classList.contains('cl-link-only'))).toEqual([true, true, false]);
    // A mixed list keeps its bullets: the buttons line up with the other items.
    expect(document.querySelector('.markdown-body ul')).not.toHaveClass('cl-link-list');
  });

  it('drops the bullets only of a list that holds nothing but link buttons', () => {
    renderAnswer('- [Prices](https://example.com/prices)\n- [Opening hours](https://example.com/hours)\n\n'
      + 'Steps:\n\n1. [Choose a date](https://example.com/date)\n2. [Pay](https://example.com/pay)');

    expect(document.querySelector('.markdown-body ul')).toHaveClass('cl-link-list');
    expect(document.querySelector('.markdown-body ol')).toHaveClass('cl-link-list');
  });

  it('marks the items of a loose list, where each link sits in a paragraph', () => {
    renderAnswer('- [Prices](https://example.com/prices)\n\n- [Opening hours](https://example.com/hours)');

    const items = Array.from(document.querySelectorAll('.markdown-body li'));
    expect(items).toHaveLength(2);
    items.forEach((item) => {
      expect(item).toHaveClass('cl-link-only');
      expect(item.querySelector('p > a')).not.toBeNull();
    });
  });

  it('passes no list props from react-markdown to the DOM', () => {
    renderAnswer('1. [Prices](https://example.com/prices)\n2. Second step');

    const item = document.querySelector('.markdown-body li')!;
    expect(item).not.toHaveAttribute('ordered');
    expect(item).not.toHaveAttribute('index');
    expect(item).not.toHaveAttribute('checked');
  });
});

// The agent writes checkout links as **[Book now](url)**, bold outside the
// link (p > strong > a), and about one answer in ten puts an emoji next to it.
describe('checkout links in the agent format', () => {
  const checkout = 'https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat&c=%5B%5D';
  const linkOnlyParagraph = (message: string, linkButtons = true) => {
    render(<ChatMessage message={message} isSend={false} message_id="answer" host_url="http://localhost:3000" linkButtons={linkButtons} />);
    const link = document.querySelector<HTMLAnchorElement>('.markdown-body a')!;
    expect(link).toHaveAttribute('href', checkout);
    return link.closest('p')!.classList.contains('cl-link-only');
  };

  it.each([
    ['a plain link', `[Book now](${checkout})`],
    ['bold around the link', `**[Book now](${checkout})**`],
    ['italics around the link', `*[Book now](${checkout})*`],
    ['bold inside the link', `[**Book now**](${checkout})`],
    ['an emoji before the bold link', `👉 **[Book now](${checkout})**`],
    ['emoji after the bold link', `**[Book now](${checkout})** 🚀✨`],
    ['an emoji inside the bold', `**👉 [Book now](${checkout})**`],
    ['an emoji with a variation selector', `[Book now](${checkout}) 🎟️`],
    ['an arrow and a skin tone', `➡️ **[Book now](${checkout})** 👍🏽`],
  ])('makes a button of %s', (_, message) => {
    expect(linkOnlyParagraph(message)).toBe(true);
  });

  it.each([
    ['text before the link', `You can book here: **[Book now](${checkout})**`],
    ['text after the link', `**[Book now](${checkout})** (€26.00 total for 2 adults).`],
    ['text inside the bold', `**Book here: [Book now](${checkout})**`],
    ['two links', `**[Book now](${checkout})** **[Gift card](${checkout})**`],
  ])('keeps a link inline with %s', (_, message) => {
    expect(linkOnlyParagraph(message)).toBe(false);
  });

  it('keeps a bold link that is not a checkout link as a bold text link', () => {
    renderAnswer('**[Opening hours](https://example.com/hours)**\n\n👉 [Prices](https://example.com/prices)\n\n'
      + '**[Book now](https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef)**');

    expect(document.querySelectorAll('.markdown-body a')).toHaveLength(3);
    expect(document.querySelectorAll('.cl-link-only')).toHaveLength(0);
    expect(document.querySelector('.markdown-body strong > a')).toHaveTextContent('Opening hours');
  });

  it('marks list items that hold a bold checkout link, also in a loose list', () => {
    renderAnswer(`- **[Book Saturday](${checkout})**\n- 👉 *[Book Sunday](${checkout})*\n\n`
      + `More dates:\n\n- **[Book Monday](${checkout})** 🎟️\n\n- **[Book Tuesday](${checkout})**`);

    const items = Array.from(document.querySelectorAll('.markdown-body li'));
    expect(items).toHaveLength(4);
    items.forEach((item) => expect(item).toHaveClass('cl-link-only'));
    expect(items[2].querySelector('p > strong > a')).not.toBeNull();
    document.querySelectorAll('.markdown-body ul').forEach((list) => expect(list).toHaveClass('cl-link-list'));
  });

  it('keeps the bullets of a list with a checkout button and a bold text link', () => {
    renderAnswer(`- **[Book Saturday](${checkout})**\n- **[Gift voucher](https://example.com/voucher)**`);

    const items = Array.from(document.querySelectorAll('.markdown-body li'));
    expect(items.map((item) => item.classList.contains('cl-link-only'))).toEqual([true, false]);
    expect(document.querySelector('.markdown-body ul')).not.toHaveClass('cl-link-list');
  });

  it('keeps text links for the swarovski theme', () => {
    expect(linkOnlyParagraph(`👉 **[Book now](${checkout})**`, false)).toBe(false);
    expect(document.querySelectorAll('.cl-link-only')).toHaveLength(0);
  });
});

describe('text links only (linkButtons false, the swarovski theme)', () => {
  it('marks no paragraph or list item, also for a bold link and a loose list', () => {
    render(
      <ChatMessage
        message={'[See all prices](https://example.com/prices)\n\n- [Directions](https://example.com/map)\n- [FAQ](https://example.com/faq)\n\n'
          + '- [Gift shop](https://example.com/gifts)\n\n- [Café](https://example.com/cafe)\n\n[**Book now**](https://example.com/book)'}
        isSend={false}
        message_id="answer"
        host_url="http://localhost:3000"
        linkButtons={false}
      />
    );

    expect(document.querySelectorAll('.markdown-body a')).toHaveLength(6);
    expect(document.querySelectorAll('.cl-link-only')).toHaveLength(0);
    expect(document.querySelectorAll('.cl-link-list')).toHaveLength(0);
  });
});

describe('isLinkOnly', () => {
  const text = (value: string) => ({ type: 'text', value });
  const link = { type: 'element', tagName: 'a', children: [text('Book')] };

  it('accepts one link with whitespace around it', () => {
    expect(isLinkOnly({ type: 'element', tagName: 'p', children: [text(' '), link, text('\n')] })).toBe(true);
  });

  it('rejects text next to the link', () => {
    expect(isLinkOnly({ type: 'element', tagName: 'p', children: [text('Book here: '), link] })).toBe(false);
  });

  it('rejects two links and empty nodes', () => {
    expect(isLinkOnly({ type: 'element', tagName: 'p', children: [link, link] })).toBe(false);
    expect(isLinkOnly({ type: 'element', tagName: 'p', children: [] })).toBe(false);
    expect(isLinkOnly(undefined)).toBe(false);
  });
});

describe('isLinkOnlyListItem', () => {
  const text = (value: string) => ({ type: 'text', value });
  const link = { type: 'element', tagName: 'a', children: [text('Prices')] };
  const paragraph = (...children: object[]) => ({ type: 'element', tagName: 'p', children });

  it('accepts a link directly in the item and a link in its only paragraph', () => {
    expect(isLinkOnlyListItem({ type: 'element', tagName: 'li', children: [link] })).toBe(true);
    expect(isLinkOnlyListItem({ type: 'element', tagName: 'li', children: [text('\n'), paragraph(link), text('\n')] })).toBe(true);
  });

  it('rejects a paragraph with text next to the link, and two paragraphs', () => {
    expect(isLinkOnlyListItem({ type: 'element', tagName: 'li', children: [paragraph(text('See '), link)] })).toBe(false);
    expect(isLinkOnlyListItem({ type: 'element', tagName: 'li', children: [paragraph(link), paragraph(link)] })).toBe(false);
  });
});

describe('isCheckoutLinkOnly', () => {
  const checkout = 'https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat';
  const text = (value: string) => ({ type: 'text', value });
  const link = (href: unknown) => ({ type: 'element', tagName: 'a', properties: { href }, children: [text('Book')] });
  const wrap = (tagName: string, ...children: object[]) => ({ type: 'element', tagName, children });

  it('accepts a checkout link in one strong or em, between emoji', () => {
    expect(isCheckoutLinkOnly(wrap('p', wrap('strong', link(checkout))))).toBe(true);
    expect(isCheckoutLinkOnly(wrap('p', text('👉 '), wrap('em', link(checkout)), text(' 🚀✨\n')))).toBe(true);
    expect(isCheckoutLinkOnly(wrap('li', text('👍🏽 '), link(checkout)))).toBe(true);
  });

  it('rejects other links, two wrappers, text, and nodes without a link', () => {
    expect(isCheckoutLinkOnly(wrap('p', wrap('strong', link('https://example.com/book'))))).toBe(false);
    expect(isCheckoutLinkOnly(wrap('p', wrap('strong', link(undefined))))).toBe(false);
    expect(isCheckoutLinkOnly(wrap('p', wrap('strong', wrap('em', link(checkout)))))).toBe(false);
    expect(isCheckoutLinkOnly(wrap('p', wrap('strong', link(checkout)), text('.')))).toBe(false);
    expect(isCheckoutLinkOnly(wrap('p', text('2 '), link(checkout)))).toBe(false);
    expect(isCheckoutLinkOnly(wrap('p', text('🚀')))).toBe(false);
    expect(isCheckoutLinkOnly(undefined)).toBe(false);
  });
});

describe('isLinkList', () => {
  const text = (value: string) => ({ type: 'text', value });
  const item = (...children: object[]) => ({ type: 'element', tagName: 'li', children });
  const link = { type: 'element', tagName: 'a', children: [text('Prices')] };
  const list = (...items: object[]) => ({ type: 'element', tagName: 'ul', children: [text('\n'), ...items, text('\n')] });

  it('accepts a list whose items all hold only a link', () => {
    expect(isLinkList(list(item(link), text('\n'), item(link)))).toBe(true);
  });

  it('rejects a mixed list and an empty list', () => {
    expect(isLinkList(list(item(link), item(text('See '), link)))).toBe(false);
    expect(isLinkList(list())).toBe(false);
    expect(isLinkList(undefined)).toBe(false);
  });
});
