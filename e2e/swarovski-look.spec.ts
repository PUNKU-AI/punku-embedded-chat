import { expect, Page, test } from '@playwright/test';
import { loadWidget, waitForInputFocus } from './widget-helpers';

// The swarovski theme keeps the look of the swarovski-widget branch, the
// bundle that its page loaded before v1.0.22: links in a sentence stay text
// links in the branch blue, the send button is a black paper plane in the
// white field, and the focused field gets a dark frame instead of the blue
// ring. Links on their own line are buttons as in the other themes: black
// with white text, outlined in the link blue in a list. A verified checkout
// link shows the checkout card with a black button. The styles are the ones
// of the live embed (no flow ID, host or texts).
const swarovskiEmbed = {
  theme: 'swarovski',
  bot_message_color: 'rgba(255, 228, 149, 0.4)',
  bot_message_style: '{"fontFamily":"\\"Euclid Circular B\\", Arial, sans-serif","fontSize":"15px","borderRadius":"1rem","borderTopLeftRadius":"0.125rem","padding":"12px 16px"}',
  user_message_style: '{"backgroundColor":"rgba(252, 207, 97, 0.8)","color":"#333333","fontSize":"15px"}',
  input_style: '{"fontFamily":"\\"Euclid Circular B\\", Arial, sans-serif","fontSize":"15px","color":"#333333"}',
  send_button_style: '{"backgroundColor":"#FFFFFF","borderRadius":"8px"}',
  send_icon_style: '{"stroke":"#000000"}',
  chat_window_style: '{"maxHeight":"550px"}',
  start_open: 'true',
  show_closed_widget_hint: 'false',
  width: '380',
  height: '640',
};

// The links of the release test answers: a link in a sentence, a link alone in
// a paragraph, a list of links, a loose list, and the checkout link in the
// agent's bold format.
const answer = 'You can find more details [on our website](https://example.com/info) and here:\n\n'
  + '[See all prices and tickets](https://example.com/tickets)\n\n'
  + '- [Directions and parking](https://example.com/directions)\n- [Frequently asked questions](https://example.com/faq)\n\n'
  + 'More to see:\n\n- [Gift shop](https://example.com/gifts)\n\n- [Museum café](https://example.com/cafe)\n\n'
  + 'I prepared 2 tickets for you.\n\n**[Book now](https://eu5.bookingkit.de/cart/set/feedfacefeedfacefeedfacefeedface?utm_source=web_chat&c=%5B%5D)** 🎟️';

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

// A made-up cart and experience for the checkout card (checkoutCards.ts).
const cardUrl = 'https://eu5.bookingkit.de/cart/set/13579bdf13579bdf13579bdf13579bdf?utm_source=web_chat&c=%5B%5D';
const cardAnswer = {
  message: `Two day tickets are free on Saturday.\n\n**[Complete your purchase](${cardUrl})**`,
  isSend: false,
  message_id: 'synthetic-card',
  checkoutCards: [{ url: cardUrl, locale: 'en', bookings: [{ count: 2, unit: 'person', product: 'Day ticket' }] }],
};

async function openConversation(page: Page, props: Record<string, string>, reply: object = { message: answer, isSend: false, message_id: 'synthetic-answer' }) {
  // A stored session: the chat opens with the answer, no request is sent.
  await page.addInitScript((stored) => {
    const now = Date.now();
    localStorage.setItem(`punku-chat-session-${window.location.hostname}-browser-fixture`, JSON.stringify({
      sessionId: 'synthetic-session',
      messages: [{ message: 'How do I get there?', isSend: true }, stored],
      createdAt: now, lastActiveAt: now, expiresAt: now + 60 * 60 * 1000,
      domain: window.location.hostname, flowId: 'browser-fixture',
    }));
  }, reply);
  await loadWidget(page, props);
  await waitForInputFocus(page);
}

function links(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    return Array.from(root.querySelectorAll<HTMLAnchorElement>('.cl-bot_message .markdown-body a')).map((link) => {
      const style = getComputedStyle(link);
      const text = link.querySelector('strong') ?? link;
      return {
        text: link.textContent,
        linkOnly: !!link.closest('.cl-link-only'),
        display: style.display,
        padding: style.paddingTop,
        background: style.backgroundColor,
        border: style.borderTopWidth,
        color: style.color,
        weight: getComputedStyle(text).fontWeight,
        underline: style.textDecorationLine,
        arrow: getComputedStyle(link, '::after').content,
        listStyle: link.closest('li') ? getComputedStyle(link.closest('li')!).listStyleType : null,
      };
    });
  });
}

function composer(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const button = root.querySelector<HTMLButtonElement>('.cl-send-button')!;
    const icon = button.querySelector<SVGElement>('svg')!;
    const field = getComputedStyle(root.querySelector('.cl-composer-field')!);
    return {
      fill: getComputedStyle(button).backgroundColor,
      iconClass: icon.getAttribute('class'),
      iconStroke: getComputedStyle(icon).stroke,
      iconWidth: getComputedStyle(icon).width,
      disabled: button.disabled,
      opacity: getComputedStyle(button).opacity,
      fieldBorder: field.borderTopColor,
      fieldRing: field.boxShadow,
    };
  });
}

test('a link in a sentence stays a text link in the branch blue and the answer weight', async ({ page }) => {
  await openConversation(page, swarovskiEmbed);
  const shown = await links(page);

  expect(shown.map((link) => link.text)).toEqual([
    'on our website', 'See all prices and tickets', 'Directions and parking', 'Frequently asked questions', 'Gift shop', 'Museum café', 'Book now',
  ]);
  expect(shown[0]).toMatchObject({
    linkOnly: false, display: 'inline', padding: '0px', background: 'rgba(0, 0, 0, 0)', border: '0px',
    color: 'rgb(9, 105, 218)', weight: '300',
  });
  expect(['none', 'normal']).toContain(shown[0].arrow);
  // The light underline of v1.0.22 stays (WCAG 1.4.1).
  expect(shown[0].underline).toContain('underline');
});

test('links on their own line are black buttons, and outlined buttons in the link blue in a list', async ({ page }) => {
  await openConversation(page, swarovskiEmbed);
  const shown = await links(page);

  // A link alone in a paragraph and the checkout link in the agent's bold format: black, white text.
  for (const link of [shown[1], shown[6]]) {
    expect(link).toMatchObject({
      linkOnly: true, display: 'inline-flex', background: 'rgb(26, 26, 26)', color: 'rgb(255, 255, 255)', border: '0px',
    });
    expect(Number(link.weight)).toBeGreaterThanOrEqual(600);
    expect(link.arrow).not.toBe('none');
  }
  // The lists of links: outlined buttons in the link blue, without bullets.
  for (const link of shown.slice(2, 6)) {
    expect(link).toMatchObject({
      linkOnly: true, display: 'inline-flex', background: 'rgba(0, 0, 0, 0)', border: '1px', color: 'rgb(9, 105, 218)', listStyle: 'none',
    });
  }
});

test('a verified checkout link shows the checkout card with a black button', async ({ page }) => {
  await openConversation(page, swarovskiEmbed, cardAnswer);
  const card = await page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const box = root.querySelector<HTMLElement>('.cl-checkout-card');
    const button = box?.querySelector<HTMLAnchorElement>('a.cl-checkout-card-button');
    if (!box || !button) return null;
    const style = getComputedStyle(box);
    const inner = box.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    return {
      title: box.querySelector('.cl-checkout-card-title')?.textContent,
      button: button.textContent,
      fill: getComputedStyle(button).backgroundColor,
      label: getComputedStyle(button).color,
      fullWidth: button.getBoundingClientRect().width >= inner - 2,
    };
  });

  expect(card).toEqual({
    title: '2 tickets · Day ticket', button: 'Book tickets', fill: 'rgb(26, 26, 26)', label: 'rgb(255, 255, 255)', fullWidth: true,
  });
});

test('the send button is a black paper plane in the white field, and focus is dark', async ({ page }) => {
  await openConversation(page, swarovskiEmbed);
  await page.keyboard.type('Two tickets for Saturday');
  // The enabled button fades in (opacity 0.4 to 1).
  await expect.poll(async () => {
    const { disabled, opacity } = await composer(page);
    return `${disabled} ${opacity}`;
  }).toBe('false 1');
  const state = await composer(page);

  // No grey fill from the contrast guard: the fill is the field's white.
  expect(state).toMatchObject({ fill: 'rgb(255, 255, 255)', iconStroke: 'rgb(0, 0, 0)', iconWidth: '18px', opacity: '1' });
  expect(state.iconClass).toContain('lucide-send');
  // The focused field: a dark frame and ring, no blue.
  expect(state.fieldBorder).toBe('rgb(26, 26, 26)');
  expect(state.fieldRing).toContain('rgba(26, 26, 26, 0.14)');
  expect(state.fieldRing).not.toContain('37, 99, 235');
});

test('other themes keep their link buttons and the arrow', async ({ page }) => {
  await openConversation(page, { ...swarovskiEmbed, theme: 'default' });
  const shown = await links(page);
  const state = await composer(page);

  expect(shown.filter((link) => link.linkOnly).map((link) => link.display)).toEqual(Array(6).fill('inline-flex'));
  expect(state.iconClass).toContain('lucide-arrow-up');
});
