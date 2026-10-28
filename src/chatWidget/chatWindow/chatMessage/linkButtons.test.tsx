import React from 'react';
import { render, screen } from '@testing-library/react';
import ChatMessage, { isCheckoutLinkOnly, isLinkList, isLinkOnly, isLinkOnlyListItem } from './index';
import { CardSpeechContext, CardSpeechRegistry, CheckoutCards, CheckoutCardsContext } from '../../components/CheckoutCard';
import { speakCheckoutCards } from '../../checkoutCards';
import type { CheckoutCardData } from '../../checkoutCards';

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
  const linkOnlyParagraph = (message: string) => {
    render(<ChatMessage message={message} isSend={false} message_id="answer" host_url="http://localhost:3000" />);
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

  // About 1% of real answers put the link on the line under the lead-in, in
  // the same paragraph. The link line then gets a paragraph of its own.
  const paragraphs = () => Array.from(document.querySelectorAll('.markdown-body > p')).map((paragraph) => ({
    text: paragraph.textContent, button: paragraph.classList.contains('cl-link-only'),
  }));

  it.each([
    ['a soft line break', `Du kannst die Buchung über folgenden Link abschließen:\n**[Book now](${checkout})**`],
    ['a hard line break (two spaces)', `Du kannst die Buchung über folgenden Link abschließen:  \n👉 **[Book now](${checkout})**`],
    ['a hard line break (a backslash)', `Du kannst die Buchung über folgenden Link abschließen:\\\n**[Book now](${checkout})**`],
    ['Windows line ends', `Du kannst die Buchung über folgenden Link abschließen:\r\n**[Book now](${checkout})** 🎟️`],
  ])('makes a button of a checkout link on the line under the lead-in, after %s', (_, message) => {
    renderAnswer(message);

    expect(paragraphs()).toEqual([
      { text: 'Du kannst die Buchung über folgenden Link abschließen:', button: false },
      { text: expect.stringContaining('Book now'), button: true },
    ]);
    expect(document.querySelector('.markdown-body br')).toBeNull();
  });

  it('keeps emoji lines with the link and the other lines with the lead-in', () => {
    renderAnswer(`Am Samstag sind Plätze frei.\nHier geht es weiter:\n👉\n**[Book now](${checkout})**\n\nBis bald!`);

    expect(paragraphs()).toEqual([
      { text: 'Am Samstag sind Plätze frei.\nHier geht es weiter:', button: false },
      { text: expect.stringMatching(/^👉\s+Book now$/), button: true },
      { text: 'Bis bald!', button: false },
    ]);
  });

  it('makes a button of a checkout link under an emoji line, after a hard break as after a soft one', () => {
    for (const lineBreak of ['  \n', '\n']) {
      const { unmount } = renderAnswer(`👉${lineBreak}**[Book now](${checkout})**`);
      expect(paragraphs()).toEqual([{ text: expect.stringContaining('Book now'), button: true }]);
      unmount();
    }
  });

  it('gives each checkout link on the last lines a button of its own', () => {
    renderAnswer(`Zwei Termine sind frei:\n**[Book Saturday](${checkout})**\n**[Book Sunday](${checkout})**`);

    expect(paragraphs()).toEqual([
      { text: 'Zwei Termine sind frei:', button: false },
      { text: 'Book Saturday', button: true },
      { text: 'Book Sunday', button: true },
    ]);
  });

  it.each([
    ['text after the link on the last line', `Hier buchen:\n**[Book now](${checkout})** für 2 Personen.`],
    ['text on the line under the link', `**[Book now](${checkout})**\nWir freuen uns auf euch.`],
    ['a link that is not a checkout link', 'Hier buchen:\n**[Book now](https://example.com/book)**'],
  ])('keeps one paragraph with %s', (_, message) => {
    renderAnswer(message);

    expect(document.querySelectorAll('.markdown-body > p')).toHaveLength(1);
    expect(document.querySelectorAll('.cl-link-only')).toHaveLength(0);
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
});

// The server sends card facts for a verified checkout link (checkoutCards.ts).
// The answer's link then shows as a checkout card. Made-up carts, experiences
// and venues: the repository is public.
describe('checkout cards in answers', () => {
  // As the server writes the link: Markdown percent-encodes the brackets,
  // braces and quotes, so the rendered href differs from the card URL.
  const cardUrl = 'https://eu5.bookingkit.de/cart/set/9a8b7c6d5e4f30211203f4e5d6c7b8a9?c=[{"t":{"q":2}}]'
    + '&sale_params[source]=web_chat&utm_source=web_chat&sale_params[punku_reference]=pk_example_card';
  const otherUrl = 'https://eu5.bookingkit.de/cart/set/11112222333344445555666677778888?utm_source=web_chat';
  const card = (booking: Partial<CheckoutCardData['bookings'][0]> = {}, locale: string | null = 'de', url = cardUrl): CheckoutCardData => ({
    url, locale, bookings: [{ count: 2, unit: 'person', product: 'Nachtführung in der Alten Mühle', ...booking }],
  });
  const answer = `Am Samstag um 18:00 Uhr sind noch Plätze frei.\n\n👉 **[Jetzt Tickets sichern](${cardUrl})** 🎟️`;
  const context = (value: Partial<CheckoutCards> = {}): CheckoutCards => ({
    cards: [card()], language: 'de', venue: 'Burg Beispielstein', ...value,
  });
  const element = (message: string, value: CheckoutCards, streaming = false) => (
    <CheckoutCardsContext.Provider value={value}>
      <ChatMessage message={message} isSend={false} message_id="answer" host_url="http://localhost:3000" streaming={streaming} />
    </CheckoutCardsContext.Provider>
  );
  const describedBy = (link: HTMLElement) => (link.getAttribute('aria-describedby') || '')
    .split(' ').map((id) => document.getElementById(id)?.textContent).join(' / ');

  it('shows the card of a checkout link in the agent format', () => {
    render(element(answer, context()));

    const body = document.querySelector('.markdown-body')!;
    const cardElement = body.querySelector(':scope > .cl-checkout-card')!;
    expect(cardElement.querySelector('.cl-checkout-card-title')).toHaveTextContent('2 Tickets · Nachtführung in der Alten Mühle');
    expect(cardElement.querySelector('.cl-checkout-card-meta')).toHaveTextContent('Burg Beispielstein');
    // The widget's own label, not the agent's link text; no emoji, no bold.
    const button = screen.getByRole('link', { name: 'Tickets buchen' });
    expect(cardElement).toContainElement(button);
    expect(button.getAttribute('href')).not.toBe(cardUrl);
    expect(button.getAttribute('href')).toContain('sale_params%5Bpunku_reference%5D=pk_example_card');
    expect(body).not.toHaveTextContent('Jetzt Tickets sichern');
    expect(cardElement.textContent).not.toMatch(/👉|🎟/);
    expect(cardElement.querySelector('strong')).toBeNull();
    expect(describedBy(button)).toBe('2 Tickets · Nachtführung in der Alten Mühle / Burg Beispielstein');
    // The lead-in stays a paragraph; no link button is left.
    expect(body.querySelector('p')).toHaveTextContent('Am Samstag um 18:00 Uhr sind noch Plätze frei.');
    expect(body.querySelectorAll('.cl-link-only')).toHaveLength(0);
  });

  it.each([
    ['en', card({ count: 1, product: 'Lantern Walk on the Old Wall' }, 'en'), '1 ticket · Lantern Walk on the Old Wall', 'Book tickets'],
    ['it', card({ count: 4, unit: 'group', product: 'VISITA GUIDATA AL FARO' }, 'it'), '4 persone · VISITA GUIDATA AL FARO', 'Prenota ora'],
    ['fr', card({ count: 5, unit: null, product: 'Atelier de chocolat' }, 'fr'), 'Atelier de chocolat', 'Réserver maintenant'],
    ['pl', card({ count: 5, product: 'Rejs statkiem po jeziorze' }, 'pl'), '5 biletów · Rejs statkiem po jeziorze', 'Zarezerwuj bilety'],
  ])('shows a card in %s', (_, data, title, label) => {
    render(element(`**[Book](${cardUrl})**`, context({ cards: [data], language: 'en', venue: undefined })));

    expect(document.querySelector('.cl-checkout-card-title')).toHaveTextContent(title);
    expect(document.querySelector('.cl-checkout-card-meta')).toBeNull();
    expect(screen.getByRole('link')).toHaveAccessibleName(label);
  });

  it.each<[string, CheckoutCardData[]]>([
    ['no card', []],
    ['a card for another link', [card({}, 'de', otherUrl)]],
    ['a card with two bookings', [{ ...card(), bookings: [card().bookings[0], { count: 1, unit: 'person', product: 'Kayak at sunset' }] }]],
    ['a card without a name', [card({ product: null })]],
  ])('keeps the filled link button with %s', (_, cards) => {
    render(element(answer, context({ cards })));

    expect(document.querySelector('.cl-checkout-card')).toBeNull();
    const link = screen.getByRole('link', { name: 'Jetzt Tickets sichern' });
    expect(link.closest('p')).toHaveClass('cl-link-only');
  });

  // GFM also renders a bare URL and <URL> as a link: they are cards too, and
  // the status region says the same card text.
  const encodedUrl = 'https://eu5.bookingkit.de/cart/set/9a8b7c6d5e4f30211203f4e5d6c7b8a9?c=%5B%5D'
    + '&utm_source=web_chat&sale_params%5Bpunku_reference%5D=pk_example_bare';
  it.each([
    ['a bare URL', encodedUrl],
    ['a bold bare URL', `**${encodedUrl}**`],
    ['an autolink', `<${encodedUrl}>`],
  ])('shows %s as a card and says the same card text', (_, link) => {
    const value = context({ cards: [card({ product: 'Kayak at sunset' }, 'de', encodedUrl)] });
    const message = `Zwei Plätze sind frei.\n\n${link}`;
    const registry = new CardSpeechRegistry();
    render(<CardSpeechContext.Provider value={registry}>{element(message, value)}</CardSpeechContext.Provider>);

    const button = screen.getByRole('link', { name: 'Tickets buchen' });
    expect(button).toHaveAttribute('href', encodedUrl);
    const title = document.querySelector('.cl-checkout-card-title')!.textContent;
    const venue = document.querySelector('.cl-checkout-card-meta')!.textContent;
    expect(title).toBe('2 Tickets · Kayak at sunset');
    expect(speakCheckoutCards(message, registry.get('answer'))).toBe(`Zwei Plätze sind frei.\n\n${title}, ${venue}: Tickets buchen`);
  });

  // Real agent answers, with the link on the line under the lead-in.
  it.each([
    ['a soft line break', 'Du kannst die Buchung über folgenden Link abschließen:', `\n**[Direkter Buchungslink](${cardUrl})**`],
    ['a hard line break', 'Sichere dir eure Plätze direkt hier:', `  \n👉 **[Jetzt Tickets buchen](${cardUrl})**`],
  ])('shows the card of a checkout link on the line under the lead-in, after %s', (_, leadIn, linkLine) => {
    render(element(`${leadIn}${linkLine}`, context()));

    const body = document.querySelector('.markdown-body')!;
    expect(Array.from(body.querySelectorAll(':scope > p')).map((paragraph) => paragraph.textContent)).toEqual([leadIn]);
    expect(body.querySelector(':scope > p + .cl-checkout-card')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Tickets buchen' })).toHaveClass('cl-checkout-card-button');
    expect(body).not.toHaveTextContent(/Buchungslink|Jetzt Tickets buchen/);
    expect(body.querySelectorAll('.cl-link-only, br')).toHaveLength(0);
  });

  it('keeps the lead-in element while the link line streams in and turns into a card', () => {
    const leadIn = 'Sichere dir eure Plätze direkt hier:';
    const full = `${leadIn}  \n👉 **[Jetzt Tickets buchen](${cardUrl})**`;
    const { rerender } = render(element(`${leadIn}  \n👉 **[Jetzt Tickets`, context(), true));
    const paragraph = document.querySelector('.markdown-body > p')!;
    expect(document.querySelectorAll('.markdown-body > p')).toHaveLength(1);

    // The link is complete: the lead-in stays, the link line is a link button.
    rerender(element(full, context(), true));
    expect(document.querySelector('.markdown-body > p')).toBe(paragraph);
    expect(paragraph).toHaveTextContent(leadIn);
    expect(screen.getByRole('link', { name: 'Jetzt Tickets buchen' }).closest('p')).toHaveClass('cl-link-only');

    // The answer is complete: the link line is the card.
    rerender(element(full, context(), false));
    expect(document.querySelector('.markdown-body > p')).toBe(paragraph);
    expect(screen.getByRole('link', { name: 'Tickets buchen' })).toHaveClass('cl-checkout-card-button');
  });

  it('keeps a checkout link in a list item or a sentence as before', () => {
    render(element(`- **[Samstag buchen](${cardUrl})**\n\n- **[Sonntag buchen](${otherUrl})**\n\n`
      + `Hier buchen: **[Jetzt buchen](${cardUrl})**`, context()));

    expect(document.querySelector('.cl-checkout-card')).toBeNull();
    const items = Array.from(document.querySelectorAll('.markdown-body li'));
    items.forEach((item) => expect(item).toHaveClass('cl-link-only'));
    expect(screen.getByRole('link', { name: 'Jetzt buchen' }).closest('p')).not.toHaveClass('cl-link-only');
  });

  it('shows the card of the last paragraph only when the answer has stopped streaming', () => {
    const { rerender } = render(element(answer, context(), true));
    expect(document.querySelector('.cl-checkout-card')).toBeNull();
    expect(screen.getByRole('link', { name: 'Jetzt Tickets sichern' }).closest('p')).toHaveClass('cl-link-only');

    rerender(element(answer, context(), false));
    expect(screen.getByRole('link', { name: 'Tickets buchen' })).toHaveClass('cl-checkout-card-button');
  });

  it('shows the card while the answer streams when a later block follows the paragraph', () => {
    render(element(`${answer}\n\nViel Spaß!`, context(), true));

    expect(screen.getByRole('link', { name: 'Tickets buchen' })).toHaveClass('cl-checkout-card-button');
  });

  it('keeps the link when a streaming paragraph grows past the link, as without a card before', () => {
    // An old server sends no card. The link-only paragraph gets more text:
    // only its class changes, as on main.
    const link = `**[Jetzt Tickets sichern](${cardUrl})**`;
    const { rerender } = render(element(link, context({ cards: [] }), true));
    const anchor = screen.getByRole('link', { name: 'Jetzt Tickets sichern' });
    expect(anchor.closest('p')).toHaveClass('cl-link-only');

    rerender(element(`${link} für 2 Personen`, context({ cards: [] }), true));
    expect(screen.getByRole('link', { name: 'Jetzt Tickets sichern' })).toBe(anchor);
    expect(anchor.closest('p')).not.toHaveClass('cl-link-only');

    // With a card, the growing paragraph never becomes a card while it streams.
    rerender(element(`${link} für 2 Personen, Samstag`, context(), true));
    expect(screen.getByRole('link', { name: 'Jetzt Tickets sichern' })).toBe(anchor);
    expect(document.querySelector('.cl-checkout-card')).toBeNull();
  });

  it('keeps the same button when the cards, the language, the venue or the text change', () => {
    const { rerender } = render(element(answer, context({ cards: [card({}, null)] })));
    const button = screen.getByRole('link', { name: 'Tickets buchen' });

    rerender(element(answer, context({ cards: [card({}, null), card({}, 'de', otherUrl)], language: 'it', venue: 'Rocca di Esempio' })));
    expect(screen.getByRole('link', { name: 'Prenota i biglietti' })).toBe(button);
    expect(document.querySelector('.cl-checkout-card-title')).toHaveTextContent('2 biglietti · Nachtführung in der Alten Mühle');
    expect(describedBy(button)).toBe('2 biglietti · Nachtführung in der Alten Mühle / Rocca di Esempio');

    rerender(element(`${answer}\n\nBis bald!`, context({ cards: [card({}, null)], language: 'it' })));
    expect(screen.getByRole('link', { name: 'Prenota i biglietti' })).toBe(button);
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
    // A hard line break counts as whitespace, as a soft one.
    expect(isCheckoutLinkOnly(wrap('p', text('👉'), wrap('br'), text('\n'), wrap('strong', link(checkout))))).toBe(true);
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
