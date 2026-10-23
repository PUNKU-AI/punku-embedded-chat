import { expect, Page, test } from '@playwright/test';
import { loadWidget } from './widget-helpers';

// Controls stay visible on a site's own colours. In the browser, the filled
// link button reaches 3:1 on the answer bubble and its label 4.5:1, links and
// outlined link buttons reach 3:1 on the bubble, and the send button reaches
// 3:1 in the field with an icon at 3:1. The colour sets come from saved
// customer embeds (anonymised).

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

const conversation = [
  { message: 'Do you have places for 2 people on Saturday?', isSend: true },
  {
    message: 'Yes, there are places. See [our prices](https://example.com/prices) first.\n\n'
      + '[See all prices and tickets](https://example.com/book)\n\n'
      + '- [Directions and parking](https://example.com/directions)\n- [Gift vouchers](https://example.com/gifts)',
    isSend: false,
    message_id: 'synthetic-answer',
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
    start_open: 'true', show_closed_widget_hint: 'false', width: '380', height: '640', ...props,
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
    if (!bubble || !filled || !inline || !outlined || !field || !send || !icon) return null;
    return {
      filled: ratio(filled.backgroundColor, bubble.backgroundColor),
      filledLabel: ratio(filled.color, filled.backgroundColor),
      inlineLink: ratio(inline.color, bubble.backgroundColor),
      outlined: ratio(outlined.borderTopColor, bubble.backgroundColor),
      send: ratio(send.backgroundColor, field.backgroundColor),
      sendIcon: ratio(icon.stroke, send.backgroundColor),
      colours: { bubble: bubble.backgroundColor, filled: filled.backgroundColor, label: filled.color },
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
  'the dark theme': { theme: 'dark' },
  'the ocean theme': { theme: 'ocean' },
};

for (const [name, props] of Object.entries(customers)) {
  test(`every control stays visible: ${name}`, async ({ page }) => {
    await openConversation(page, props);
    const result = (await contrasts(page))!;
    expect(result.filled, JSON.stringify(result.colours)).toBeGreaterThanOrEqual(3);
    expect(result.filledLabel, JSON.stringify(result.colours)).toBeGreaterThanOrEqual(4.5);
    expect(result.inlineLink).toBeGreaterThanOrEqual(3);
    expect(result.outlined).toBeGreaterThanOrEqual(3);
    expect(result.send).toBeGreaterThanOrEqual(3);
    expect(result.sendIcon).toBeGreaterThanOrEqual(3);
  });
}

test('the filled button in the bubble colour turns gold with the bubble colour as text', async ({ page }) => {
  await openConversation(page, customers['a button in the bubble colour, gold links']);
  const result = (await contrasts(page))!;
  expect(result.colours).toEqual({
    bubble: 'rgb(158, 24, 59)', filled: 'rgb(255, 215, 0)', label: 'rgb(158, 24, 59)',
  });
});
