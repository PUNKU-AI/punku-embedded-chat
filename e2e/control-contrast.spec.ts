import { expect, Page, test } from '@playwright/test';
import { assertHintVisible, loadWidget } from './widget-helpers';

// Controls stay visible on a site's own colours. In the browser, the filled
// link button reaches 3:1 on the answer bubble and its label 4.5:1, link text
// reaches 4.5:1 on the bubble and outlines 3:1, the send button reaches 3:1 in
// the field with an icon at 3:1, and the AI notice reaches 4.5:1 on the input
// bar. The closed hint text reaches 4.5:1 on the hint. On the checkout card,
// the button reaches 3:1 on the card and its label 4.5:1, and the title and
// the venue line read as well as the answer text, up to 4.5:1. The colour
// sets come from saved customer embeds (anonymised). Without button_color,
// the filled link button and the card button take the site's own colours:
// link_color, else the send button, else the visitor bubbles.

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
    send_button_style: JSON.stringify({ backgroundColor: '#F2B705' }), user_message_color: '#FFF2CC',
  },
  'white text on mid green answers, a light grey window': {
    button_text_color: '#ffffff', background_color: '#f1efee', bot_message_color: '#3aaa35',
    bot_message_text_color: '#ffffff', send_button_style: JSON.stringify({ backgroundColor: '#3aaa35' }),
    user_message_color: '#046035',
  },
  'a mid blue window': {
    background_color: '#33a1e6', send_button_style: JSON.stringify({ backgroundColor: '#2a3849' }), user_message_color: '#2a3849',
  },
  'pink links on white answers': {
    link_color: '#dd4a97', send_button_style: JSON.stringify({ backgroundColor: '#dd4a97' }), user_message_color: '#ed719e',
  },
  'dark blue links on white answers': {
    link_color: '#075985', send_button_style: JSON.stringify({ backgroundColor: '#075985' }), user_message_color: '#075985',
  },
  'blue links on light blue answers': {
    button_text_color: '#FFFFFF', background_color: '#FFFFFF', bot_message_color: '#EAF1FF', bot_message_text_color: '#111827',
    link_color: '#2760CF', user_message_color: '#2760CF',
  },
  'a gradient send button and dark blue visitor bubbles': {
    send_button_style: JSON.stringify({ background: 'linear-gradient(135deg, #00496F 0%, #246479 100%)' }),
    user_message_color: '#003a5d',
  },
  'green buttons and links in the dark theme': {
    theme: 'dark', button_color: '#3F9B47', button_text_color: '#FFFFFF', background_color: '#111827',
    bot_message_color: '#1F2937', bot_message_text_color: '#F9FAFB', link_color: '#3F9B47',
  },
  'a green button on near-black answers': {
    button_color: '#15803d', button_text_color: '#ffffff', bot_message_color: '#111827', bot_message_text_color: '#ffffff',
  },
  'a light blue visitor colour in the ocean theme': { theme: 'ocean', user_message_color: '#0ea5e9' },
  'a dark blue link colour in the dark theme': { theme: 'dark', link_color: '#075985' },
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

// The filled link button and the card button in the site's own colour, as
// it is or a little darker (controlColors.ts siteFilled). Before, every set
// without button_color showed the theme blue rgb(9, 105, 218), the mid green
// answers black. With button_color, the gold stays.
const siteFills: Record<string, { fill: string; label: string }> = {
  'gold links and a yellow send button on white': { fill: 'rgb(188, 140, 0)', label: 'rgb(28, 28, 28)' },
  'pink links on white answers': { fill: 'rgb(199, 67, 136)', label: 'rgb(255, 255, 255)' },
  'dark blue links on white answers': { fill: 'rgb(7, 89, 133)', label: 'rgb(255, 255, 255)' },
  'blue links on light blue answers': { fill: 'rgb(39, 96, 207)', label: 'rgb(255, 255, 255)' },
  'white text on mid green answers, a light grey window': { fill: 'rgb(3, 82, 45)', label: 'rgb(255, 255, 255)' },
  'a mid blue window': { fill: 'rgb(42, 56, 73)', label: 'rgb(255, 255, 255)' },
  'a gradient send button and dark blue visitor bubbles': { fill: 'rgb(0, 58, 93)', label: 'rgb(255, 255, 255)' },
  'a button in the bubble colour, gold links': { fill: 'rgb(255, 215, 0)', label: 'rgb(158, 24, 59)' },
  // The ocean theme: the site's light blue with the theme's dark label.
  'a light blue visitor colour in the ocean theme': { fill: 'rgb(14, 165, 233)', label: 'rgb(8, 47, 73)' },
  // The dark theme: the dark site blue does not read on the dark bubble, so the theme accent stays.
  'a dark blue link colour in the dark theme': { fill: 'rgb(165, 180, 252)', label: 'rgb(30, 27, 75)' },
};

for (const [name, { fill, label }] of Object.entries(siteFills)) {
  test(`link buttons take the site colour: ${name}`, async ({ page }) => {
    await openConversation(page, customers[name]);
    const result = (await contrasts(page))!;
    expect({ filled: result.colours.filled, label: result.colours.label }).toEqual({ filled: fill, label });
    expect({ button: result.card.button, label: result.card.label }).toEqual({ button: fill, label });
  });
}

// A site colour fill gets a hover shade: the pink, 10% darker, on the link
// button and on the card button. Touch screens show no hover.
test('link buttons in a site colour darken on hover', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'Hover runs on the three desktop engines.');
  await openConversation(page, customers['pink links on white answers']);
  const hovered = async (selector: string) => {
    const box = await page.evaluate((target) => {
      const element = window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector<HTMLElement>(target)!;
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, selector);
    await page.mouse.move(box.x, box.y);
    await expect.poll(() => page.evaluate((target) => getComputedStyle(
      window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector(target)!,
    ).backgroundColor, selector)).toBe('rgb(179, 60, 122)');
    await page.mouse.move(0, 0);
  };
  await hovered('.markdown-body > p.cl-link-only > a');
  await hovered('.cl-checkout-card-button');
});
