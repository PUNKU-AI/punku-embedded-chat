import React from 'react';
import { render } from '@testing-library/react';
import ChatMessage, { isLinkOnly, isLinkOnlyListItem } from './index';

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
