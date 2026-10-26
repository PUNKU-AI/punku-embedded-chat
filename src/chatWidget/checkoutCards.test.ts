import {
  CheckoutCardData, findCheckoutCard, formatCheckoutCard, mergeCheckoutCards, readCheckoutCards,
  speakCheckoutCards, storedCheckoutCards,
} from './checkoutCards';
import { LANGUAGES } from '../translations';

// Made-up carts, experiences and venues. The repository is public.
const CART_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const CART_B = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const cart = (id: string, query = '') =>
  `https://eu5.bookingkit.de/cart/set/${id}?c=%5B%7B%22t%22%3A%7B%22q%22%3A2%7D%7D%5D&sale_params[source]=web_chat`
  + `&utm_source=web_chat&utm_medium=chat_widget${query}`;
const URL_A = cart(CART_A, '&sale_params[punku_reference]=pk_example_a');
const URL_B = cart(CART_B);

const block = (data: unknown, type = 'json') => ({ title: 'Checkout', contents: [{ type, data }] });
const cardData = (overrides: Record<string, unknown> = {}, booking: Record<string, unknown> = {}) => ({
  kind: 'punku.checkout_card', v: 1, url: URL_A, locale: 'de',
  bookings: [{ count: 2, unit: 'person', product: 'Nachtführung in der Alten Mühle', ...booking }],
  ...overrides,
});
const card = (booking: Partial<CheckoutCardData['bookings'][0]> = {}, locale: string | null = null): CheckoutCardData => ({
  url: URL_A, locale, bookings: [{ count: 2, unit: 'person', product: 'Lantern Walk on the Old Wall', ...booking }],
});

describe('readCheckoutCards', () => {
  it('reads the card of an agent message', () => {
    expect(readCheckoutCards([block(cardData())])).toEqual([{
      url: URL_A, locale: 'de',
      bookings: [{ count: 2, unit: 'person', product: 'Nachtführung in der Alten Mühle' }],
    }]);
  });

  it('keeps only the values of the contract', () => {
    const [read] = readCheckoutCards([block(cardData({ header: { title: 'Checkout card' }, extra: 'x' }, { price: 98 }))]);
    expect(Object.keys(read).sort()).toEqual(['bookings', 'locale', 'url']);
    expect(Object.keys(read.bookings[0]).sort()).toEqual(['count', 'product', 'unit']);
  });

  it('reads null and missing values as unknown', () => {
    expect(readCheckoutCards([block(cardData({ locale: undefined }, { count: null, unit: undefined, product: null }))]))
      .toEqual([{ url: URL_A, locale: null, bookings: [{ count: null, unit: null, product: null }] }]);
  });

  it('collapses the spaces of a name', () => {
    const [read] = readCheckoutCards([block(cardData({}, { product: '  Kayak  at\nsunset ' }))]);
    expect(read.bookings[0].product).toBe('Kayak at sunset');
  });

  it('reads cards next to other blocks and keeps one card per URL, the later one', () => {
    const blocks = [
      { title: 'Agent Steps', contents: [{ type: 'text', text: 'Thinking' }] },
      block(cardData({}, { count: 1 })),
      block(cardData({ url: URL_B }, { product: 'Taller de cerámica' })),
      block(cardData({}, { count: 3 })),
    ];
    const read = readCheckoutCards(blocks);
    expect(read.map((item) => [item.url, item.bookings[0].count])).toEqual([[URL_B, 2], [URL_A, 3]]);
  });

  it('never reads tool output', () => {
    const toolUse = {
      title: 'Agent Steps',
      contents: [{
        type: 'tool_use', name: 'CreateVerifiedCheckoutLink', tool_input: {},
        output: { checkoutCard: { version: 1, bookings: [{ count: 2, unit: 'person', product: 'Secret' }] }, checkoutUrl: URL_A },
      }],
    };
    expect(readCheckoutCards([toolUse])).toEqual([]);
    expect(readCheckoutCards([block(cardData(), 'tool_use')])).toEqual([]);
  });

  it.each([
    ['another kind', cardData({ kind: 'punku.other' })],
    ['another version', cardData({ v: 2 })],
    ['a version as text', cardData({ v: '1' })],
    ['another host', cardData({ url: URL_A.replace('eu5.bookingkit.de', 'example.com') })],
    ['a link without the chat source', cardData({ url: URL_A.replace('utm_source=web_chat', 'utm_source=mail') })],
    ['no URL', cardData({ url: undefined })],
    ['no bookings', cardData({ bookings: [] })],
    ['five bookings', cardData({ bookings: Array(5).fill({ count: 1, unit: 'person', product: 'Kayak at sunset' }) })],
    ['a booking that is not an object', cardData({ bookings: ['2 tickets'] })],
    ['a count of 0', cardData({}, { count: 0 })],
    ['a count of 100', cardData({}, { count: 100 })],
    ['a count with a fraction', cardData({}, { count: 2.5 })],
    ['a count as text', cardData({}, { count: '2' })],
    ['an unknown unit', cardData({}, { unit: 'seat' })],
    ['a name of 121 characters', cardData({}, { product: 'x'.repeat(121) })],
    ['a name that is not text', cardData({}, { product: 42 })],
    ['a locale of 121 characters', cardData({ locale: 'd'.repeat(121) })],
  ])('rejects a card with %s', (_, data) => {
    expect(readCheckoutCards([block(data)])).toEqual([]);
  });

  it('counts the limit in code points, as the server does: an emoji counts once', () => {
    expect(readCheckoutCards([block(cardData({}, { product: '🛶'.repeat(120) }))])).toHaveLength(1);
    expect(readCheckoutCards([block(cardData({}, { product: '🛶'.repeat(121) }))])).toEqual([]);
  });

  it('accepts the limits: 1 and 99, a name of 120 characters, four bookings', () => {
    expect(readCheckoutCards([block(cardData({}, { count: 1 }))])).toHaveLength(1);
    expect(readCheckoutCards([block(cardData({}, { count: 99, product: 'x'.repeat(120) }))])).toHaveLength(1);
    const four = Array(4).fill({ count: 1, unit: 'group', product: 'Kayak at sunset' });
    expect(readCheckoutCards([block(cardData({ bookings: four }))])[0].bookings).toHaveLength(4);
  });

  it('reads nothing from a value that is not a list of blocks', () => {
    expect(readCheckoutCards(undefined)).toEqual([]);
    expect(readCheckoutCards({ contents: [] })).toEqual([]);
    expect(readCheckoutCards([null, 'text', { contents: 'x' }])).toEqual([]);
  });
});

describe('storedCheckoutCards and mergeCheckoutCards', () => {
  it('checks stored cards again and drops the invalid ones', () => {
    const stored = [card(), { ...card(), url: 'https://example.com/cart' }, { ...card({ count: 500 }), url: URL_B }];
    expect(storedCheckoutCards(stored)).toEqual([card()]);
    expect(storedCheckoutCards('cards')).toEqual([]);
  });

  it('replaces a card with a newer one for the same URL', () => {
    const first = card({ count: 1 });
    const other = { ...card(), url: URL_B };
    const newer = card({ count: 4 });
    expect(mergeCheckoutCards([first, other], [newer])).toEqual([other, newer]);
    expect(mergeCheckoutCards([first], [])).toEqual([first]);
  });
});

describe('findCheckoutCard', () => {
  const plain = { ...card(), url: URL_B };

  it('finds the card of a link that Markdown percent-encoded', () => {
    const encoded = URL_A.replace(/\[/g, '%5B').replace(/]/g, '%5D');
    expect(encoded).not.toBe(URL_A);
    expect(findCheckoutCard([card()], encoded)).toEqual(card());
    expect(findCheckoutCard([plain], URL_B.replace(/\[/g, '%5B').replace(/]/g, '%5D'))).toEqual(plain);
  });

  it('finds the card when the server added lang or bklink to the link', () => {
    expect(findCheckoutCard([plain], `${URL_B}&lang=de&bklink=widget`)).toEqual(plain);
    expect(findCheckoutCard([{ ...plain, url: `${URL_B}&lang=it` }], URL_B)).toEqual({ ...plain, url: `${URL_B}&lang=it` });
  });

  it('finds the card in another parameter order', () => {
    const reordered = `https://eu5.bookingkit.de/cart/set/${CART_B}?utm_medium=chat_widget&utm_source=web_chat`
      + '&sale_params%5Bsource%5D=web_chat&c=%5B%7B%22t%22%3A%7B%22q%22%3A2%7D%7D%5D';
    expect(findCheckoutCard([plain], reordered)).toEqual(plain);
  });

  it('matches on the punku reference when both links have one', () => {
    const changed = URL_A.replace('utm_medium=chat_widget', 'utm_medium=chat_bubble');
    expect(findCheckoutCard([card()], changed)).toEqual(card());
    expect(findCheckoutCard([card()], URL_A.replace('pk_example_a', 'pk_example_z'))).toBeNull();
    // The same reference with another merchant or another cart is not the same checkout.
    expect(findCheckoutCard([card()], URL_A.replace(CART_A, CART_B))).toBeNull();
    expect(findCheckoutCard([card()], URL_A.replace('%22q%22%3A2', '%22q%22%3A3'))).toBeNull();
  });

  it('finds no card for another cart or other parameters', () => {
    expect(findCheckoutCard([plain], cart(CART_A))).toBeNull();
    expect(findCheckoutCard([plain], URL_B.replace('%22q%22%3A2', '%22q%22%3A3'))).toBeNull();
    // Only one of the links has a reference: the parameters differ.
    expect(findCheckoutCard([card()], cart(CART_A))).toBeNull();
  });

  it('takes the newest of two matching cards', () => {
    const older = { ...plain, bookings: [{ count: 1, unit: 'person' as const, product: 'Kayak at sunset' }] };
    const newer = { ...plain, url: `${URL_B}&lang=en` };
    expect(findCheckoutCard([older, newer], URL_B)).toBe(newer);
  });

  it('finds nothing without a link or cards', () => {
    expect(findCheckoutCard([card()], undefined)).toBeNull();
    expect(findCheckoutCard([card()], 'not a url')).toBeNull();
    expect(findCheckoutCard([], URL_A)).toBeNull();
  });
});

describe('formatCheckoutCard', () => {
  const NAME = 'Lantern Walk on the Old Wall';

  it.each([
    ['en', 1, '1 ticket'], ['en', 2, '2 tickets'], ['en', 5, '5 tickets'],
    ['de', 1, '1 Ticket'], ['de', 2, '2 Tickets'], ['de', 5, '5 Tickets'],
    ['it', 1, '1 biglietto'], ['it', 2, '2 biglietti'], ['it', 5, '5 biglietti'],
    ['es', 1, '1 entrada'], ['es', 2, '2 entradas'], ['es', 5, '5 entradas'],
    ['pt', 1, '1 bilhete'], ['pt', 2, '2 bilhetes'], ['pt', 5, '5 bilhetes'],
    ['fr', 1, '1 billet'], ['fr', 2, '2 billets'], ['fr', 5, '5 billets'],
    ['pl', 1, '1 bilet'], ['pl', 2, '2 bilety'], ['pl', 5, '5 biletów'],
    ['pl', 12, '12 biletów'], ['pl', 22, '22 bilety'], ['pl', 25, '25 biletów'],
  ] as const)('counts tickets in %s: %i gives %p', (language, count, amount) => {
    expect(formatCheckoutCard(card({ count }, language), 'en')?.title).toBe(`${amount} · ${NAME}`);
  });

  it.each([
    ['en', 1, '1 person'], ['en', 4, '4 people'],
    ['de', 1, '1 Person'], ['de', 4, '4 Personen'],
    ['it', 4, '4 persone'], ['es', 4, '4 personas'], ['pt', 4, '4 pessoas'], ['fr', 4, '4 personnes'],
    ['pl', 1, '1 osoba'], ['pl', 4, '4 osoby'], ['pl', 5, '5 osób'],
  ] as const)('counts a group in %s: %i gives %p', (language, count, amount) => {
    expect(formatCheckoutCard(card({ count, unit: 'group' }, language), 'en')?.title).toBe(`${amount} · ${NAME}`);
  });

  it.each([
    ['en', 'Book tickets', 'Book now'],
    ['de', 'Tickets buchen', 'Jetzt buchen'],
    ['it', 'Prenota i biglietti', 'Prenota ora'],
    ['es', 'Reservar entradas', 'Reservar ahora'],
    ['pt', 'Reservar bilhetes', 'Reservar agora'],
    ['fr', 'Réserver les billets', 'Réserver maintenant'],
    ['pl', 'Zarezerwuj bilety', 'Zarezerwuj teraz'],
  ] as const)('labels the button in %s', (language, tickets, other) => {
    expect(formatCheckoutCard(card({ unit: 'person' }), language)?.label).toBe(tickets);
    expect(formatCheckoutCard(card({ unit: 'group' }), language)?.label).toBe(other);
    expect(formatCheckoutCard(card({ unit: null }), language)?.label).toBe(other);
  });

  it('shows only the name without a unit or a count', () => {
    expect(formatCheckoutCard(card({ unit: null, count: 3 }), 'de')).toEqual({ title: NAME, label: 'Jetzt buchen', language: 'de' });
    expect(formatCheckoutCard(card({ unit: 'person', count: null }), 'de')).toEqual({ title: NAME, label: 'Tickets buchen', language: 'de' });
  });

  it('never translates the name', () => {
    for (const language of LANGUAGES) {
      expect(formatCheckoutCard(card({ product: 'Taller de cerámica', count: 1 }), language)?.title).toMatch(/ · Taller de cerámica$/);
    }
  });

  it.each([
    'DIE GROSSE HAFENRUNDFAHRT', 'VISITA GUIDATA AL FARO', '31 OTTOBRE | NOTTE DELLE LANTERNE | VIP', 'Kayak SUP Tour', 'taller de cerámica',
  ])('shows the name %p exactly as the vendor writes it', (product) => {
    expect(formatCheckoutCard(card({ product, count: 5 }, 'it'), 'en')?.title).toBe(`5 biglietti · ${product}`);
  });

  it('takes the language of the card when the widget has it, else the chat language', () => {
    expect(formatCheckoutCard(card({}, 'de-AT'), 'en')).toMatchObject({ title: `2 Tickets · ${NAME}`, label: 'Tickets buchen', language: 'de' });
    expect(formatCheckoutCard(card({}, 'nl'), 'fr')).toMatchObject({ title: `2 billets · ${NAME}`, language: 'fr' });
    expect(formatCheckoutCard(card({}, null), 'es')).toMatchObject({ title: `2 entradas · ${NAME}`, language: 'es' });
  });

  it('shows no card without a name or with more than one booking', () => {
    expect(formatCheckoutCard(card({ product: null }), 'en')).toBeNull();
    const two = { ...card(), bookings: [card().bookings[0], { count: 1, unit: 'person' as const, product: 'Kayak at sunset' }] };
    expect(formatCheckoutCard(two, 'en')).toBeNull();
  });
});

describe('speakCheckoutCards', () => {
  const NAME = 'Lantern Walk on the Old Wall';
  const cards = [card({ count: 2 }, 'de')];
  const lead = 'Am Samstag sind noch Plätze frei.';

  it.each([
    ['the agent format', `**[Jetzt sichern](${URL_A})**`],
    ['emoji around the link', `👉 **[Jetzt sichern](${URL_A})** 🎟️`],
    ['a plain link that Markdown would encode', `[Jetzt sichern](${URL_A.replace(/\[/g, '%5B').replace(/]/g, '%5D')})`],
  ])('says the card, not the link text, for %s', (_, link) => {
    expect(speakCheckoutCards(`${lead}\n\n${link}\n\nBis bald!`, { cards, language: 'en', venue: 'Burg Beispielstein' }))
      .toBe(`${lead}\n\n2 Tickets · ${NAME}, Burg Beispielstein: Tickets buchen\n\nBis bald!`);
  });

  it('leaves out the venue when there is none', () => {
    expect(speakCheckoutCards(`**[Book](${URL_A})**`, { cards: [card({ count: 1 }, 'en')], language: 'en' }))
      .toBe(`1 ticket · ${NAME}: Book tickets`);
  });

  it.each([
    ['no card', `**[Jetzt sichern](${URL_A})**`, []],
    ['a card for another link', `**[Jetzt sichern](${URL_B})**`, cards],
    ['text next to the link', `Hier buchen: **[Jetzt sichern](${URL_A})**`, cards],
    ['a list item', `- **[Jetzt sichern](${URL_A})**`, cards],
    ['two links', `[Jetzt sichern](${URL_A}) [Gutschein](${URL_B})`, cards],
    ['a card without a name', `**[Jetzt sichern](${URL_A})**`, [card({ product: null })]],
  ] as const)('keeps the Markdown with %s', (_, markdown, list) => {
    expect(speakCheckoutCards(markdown, { cards: [...list] as CheckoutCardData[], language: 'de' })).toBe(markdown);
  });
});
