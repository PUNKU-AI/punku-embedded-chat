import { expect, Page, test } from '@playwright/test';
import { assertHintVisible, loadWidget } from './widget-helpers';

// Controls stay visible on a site's own colours. In the browser, the filled
// link button reaches 3:1 on the answer bubble and its label 4.5:1, link text
// reaches 4.5:1 on the bubble and outlines 3:1, the send button reaches 3:1 in
// the field with an icon at 3:1, and the AI notice reaches 4.5:1 on the input
// bar. The closed hint text reaches 4.5:1 on the hint. On the checkout card,
// the button reaches 3:1 on the card and its label 4.5:1, and the title and
// the venue line read as well as the answer text, up to 4.5:1. The colour
// sets come from saved customer embeds (anonymised).

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
const conversation = [
  { message: 'Do you have places for 2 people on Saturday?', isSend: true },
  {
    message: 'Yes, there are places. See [our prices](https://example.com/prices) first.\n\n'
      + '[See all prices and tickets](https://example.com/book)\n\n'
      + '- [Directions and parking](https://example.com/directions)\n- [Gift vouchers](https://example.com/gifts)',
    isSend: false,
    message_id: 'synthetic-answer',
  },
  {
    message: `I have prepared 2 tickets for you.\n\n👉 **[Book my tickets](${cardUrl})**`,
    isSend: false,
    message_id: 'synthetic-card',
    checkoutCards: [{ url: cardUrl, locale: null, bookings: [{ count: 2, unit: 'person', product: 'Harbour lantern tour' }] }],
  },
];

async function openConversation(page: Page, props: Record<string, string>) {
  await page.addInitScript((messages) => {
    const now = Date.now();
    localStorage.setItem(`punku-chat-session-${window.location.hostname}-browser-fixture`, JSON.stringify({
      sessionId: 'synthetic-session', messages, createdAt: now, lastActiveAt: now,
      expiresAt: now + 60 * 60 * 1000, domain: window.location.hostname, flowId: 'browser-fixture',
    }));
  }, conversation);
  await loadWidget(page, {
    start_open: 'true', show_closed_widget_hint: 'false', width: '380', height: '640',
    checkout_card_venue: 'Castle of Example', ...props,
  });
  await expect.poll(async () => (await contrasts(page))?.filled).toBeTruthy();
}

/** The contrast ratios that the browser renders, per control. */
function contrasts(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const channels = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const [r, g, b] = channels(value).map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
    };
    const style = (selector: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      return element ? getComputedStyle(element) : null;
    };
    const bubble = style('.cl-bot_message');
    const filled = style('.markdown-body > p.cl-link-only > a');
    const inline = style('.markdown-body p:not(.cl-link-only) a');
    const outlined = style('.markdown-body li.cl-link-only > a');
    const field = style('.cl-composer-field');
    const send = style('.cl-send-button');
    const icon = style('.cl-send-icon');
    const bar = style('.cl-input_container');
    const notice = style('.cl-ai-notice');
    const card = style('.cl-checkout-card');
    const cardTitle = style('.cl-checkout-card-title');
    const cardVenue = style('.cl-checkout-card-meta');
    const cardButton = style('.cl-checkout-card-button');
    if (!bubble || !filled || !inline || !outlined || !field || !send || !icon || !bar || !notice) return null;
    if (!card || !cardTitle || !cardVenue || !cardButton) return null;
    // A translucent card shows the bubble through it.
    const over = (top: string, back: string) => {
      const alpha = Number((top.match(/[\d.]+/g) || [])[3] ?? 1);
      const [a, b] = [channels(top), channels(back)];
      return `rgb(${a.map((channel, index) => Math.round(channel * alpha + b[index] * (1 - alpha))).join(', ')})`;
    };
    const cardSurface = over(card.backgroundColor, bubble.backgroundColor);
    // The site's own answer contrast, up to 4.5:1, is the floor on the card.
    const answerContrast = Math.min(4.5, Math.floor(ratio(bubble.color, bubble.backgroundColor) * 100) / 100);
    return {
      filled: ratio(filled.backgroundColor, bubble.backgroundColor),
      filledLabel: ratio(filled.color, filled.backgroundColor),
      inlineLink: ratio(inline.color, bubble.backgroundColor),
      outlined: ratio(outlined.borderTopColor, bubble.backgroundColor),
      outlinedLabel: ratio(outlined.color, bubble.backgroundColor),
      send: ratio(send.backgroundColor, field.backgroundColor),
      sendIcon: ratio(icon.stroke, send.backgroundColor),
      notice: ratio(notice.color, bar.backgroundColor),
      cardButton: ratio(cardButton.backgroundColor, cardSurface),
      cardLabel: ratio(cardButton.color, cardButton.backgroundColor),
      cardTitle: ratio(cardTitle.color, cardSurface),
      cardVenue: ratio(cardVenue.color, cardSurface),
      answerContrast,
      colours: { bubble: bubble.backgroundColor, filled: filled.backgroundColor, label: filled.color },
      card: { surface: cardSurface, button: cardButton.backgroundColor, label: cardButton.color, venue: cardVenue.color },
    };
  });
}

const customers: Record<string, Record<string, string>> = {
  'a button in the bubble colour, gold links': {
    button_color: '#9e183b', button_text_color: '#ffffff', background_color: '#ffffff',
    bot_message_color: '#9e183b', bot_message_text_color: '#ffffff', link_color: '#FFD700',
    send_button_style: JSON.stringify({ backgroundColor: '#9e183b' }),
  },
  'dark red answers, theme links': {
    bot_message_color: '#791f0d', bot_message_text_color: '#ffffff',
    send_button_style: JSON.stringify({ backgroundColor: '#791f0d' }),
  },
  'a light green button on a light bubble': {
    theme: 'punku-ai-bookingkit', button_color: '#38AA3F',
    bot_message_style: JSON.stringify({ backgroundColor: '#F0F7FA', color: '#0f172a' }),
  },
  'a light grey send button, cyan links on red': {
    link_color: '#76E2F5',
    bot_message_style: JSON.stringify({ backgroundColor: '#A32525', color: '#FFFFFF' }),
    send_button_style: JSON.stringify({ backgroundColor: '#DDDDDD' }),
    send_icon_style: JSON.stringify({ stroke: '#333333' }),
  },
  'gold links and a yellow send button on white': {
    button_text_color: '#1C1C1C', background_color: '#FAFAF8', bot_message_color: '#FFFFFF',
    bot_message_text_color: '#2A2A2A', link_color: '#C69300',
    send_button_style: JSON.stringify({ backgroundColor: '#F2B705' }),
  },
  'white text on mid green answers, a light grey window': {
    button_text_color: '#ffffff', background_color: '#f1efee', bot_message_color: '#3aaa35',
    bot_message_text_color: '#ffffff', send_button_style: JSON.stringify({ backgroundColor: '#3aaa35' }),
  },
  'a mid blue window': {
    background_color: '#33a1e6', send_button_style: JSON.stringify({ backgroundColor: '#2a3849' }),
  },
  'green buttons and links in the dark theme': {
    theme: 'dark', button_color: '#3F9B47', button_text_color: '#FFFFFF', background_color: '#111827',
    bot_message_color: '#1F2937', bot_message_text_color: '#F9FAFB', link_color: '#3F9B47',
  },
  'a green button on near-black answers': {
    button_color: '#15803d', button_text_color: '#ffffff', bot_message_color: '#111827', bot_message_text_color: '#ffffff',
  },
  'the dark theme': { theme: 'dark' },
  'the ocean theme': { theme: 'ocean' },
};

for (const [name, props] of Object.entries(customers)) {
  test(`every control stays visible: ${name}`, async ({ page }) => {
    await openConversation(page, props);
    const result = (await contrasts(page))!;
    expect(result.filled, JSON.stringify(result.colours)).toBeGreaterThanOrEqual(3);
    expect(result.filledLabel, JSON.stringify(result.colours)).toBeGreaterThanOrEqual(4.5);
    expect(result.inlineLink).toBeGreaterThanOrEqual(4.5);
    expect(result.outlined).toBeGreaterThanOrEqual(3);
    expect(result.outlinedLabel).toBeGreaterThanOrEqual(4.5);
    expect(result.send).toBeGreaterThanOrEqual(3);
    expect(result.sendIcon).toBeGreaterThanOrEqual(3);
    expect(result.notice).toBeGreaterThanOrEqual(4.5);
    expect(result.cardButton, JSON.stringify(result.card)).toBeGreaterThanOrEqual(3);
    expect(result.cardLabel, JSON.stringify(result.card)).toBeGreaterThanOrEqual(4.5);
    expect(result.cardTitle, JSON.stringify(result.card)).toBeGreaterThanOrEqual(result.answerContrast);
    expect(result.cardVenue, JSON.stringify(result.card)).toBeGreaterThanOrEqual(result.answerContrast);
  });
}

test('the checkout card button gets its own fill where the site green vanishes on the card', async ({ page }) => {
  await openConversation(page, customers['a green button on near-black answers']);
  const result = (await contrasts(page))!;
  // Link buttons outside the card keep the site green.
  expect(result.colours.filled).toBe('rgb(21, 128, 61)');
  expect(result.card.button).not.toBe('rgb(21, 128, 61)');
});

test('the closed hint darkens a light green just enough for its white text', async ({ page }) => {
  await loadWidget(page, {
    closed_widget_hint_text: 'Curious? Ask me.',
    closed_widget_hint_background_color: '#3F9B47', closed_widget_hint_text_color: '#FFFFFF',
  });
  const hint = await assertHintVisible(page);
  // White on #3F9B47 reads at 3.5:1. The text stays white on a darker green.
  expect(hint.color).toBe('rgb(255, 255, 255)');
  expect(hint.background).not.toBe('rgb(63, 155, 71)');
  const ratio = await page.evaluate((background) => {
    const [r, g, b] = (background.match(/[\d.]+/g) || []).slice(0, 3).map((channel) => {
      const c = Number(channel) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
  }, hint.background);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('the filled button in the bubble colour turns gold with the bubble colour as text', async ({ page }) => {
  await openConversation(page, customers['a button in the bubble colour, gold links']);
  const result = (await contrasts(page))!;
  expect(result.colours).toEqual({
    bubble: 'rgb(158, 24, 59)', filled: 'rgb(255, 215, 0)', label: 'rgb(158, 24, 59)',
  });
});
