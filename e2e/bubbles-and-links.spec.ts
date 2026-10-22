import { expect, Page, test } from '@playwright/test';
import { loadWidget } from './widget-helpers';

// Bubbles and links in answers. Visitor text is left-aligned in a right-aligned
// bubble, bubbles have an 18px radius with a 6px tail, a change of sender gets
// more room than two messages from one sender, and a link on its own line is a
// button: filled in a paragraph, outlined in a list.

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
  { message: 'Do you have family tickets for Saturday? We are two adults and two children.', isSend: true },
  { message: 'Yes. The **Family ticket** is the best value.', isSend: false, message_id: 'synthetic-answer-1' },
  {
    message: 'Families get a discount.\n\n[Book family tickets](https://example.com/book)\n\n'
      + '- [Prices](https://example.com/prices)\n- [Opening hours](https://example.com/hours)\n\n'
      + 'Visit [our shop](https://example.com/shop) for gifts.',
    isSend: false,
    message_id: 'synthetic-answer-2',
  },
  {
    // A loose list: blank lines between the items put each link in a paragraph.
    message: 'More to see:\n\n- [Gift shop](https://example.com/gifts)\n\n- [Museum café](https://example.com/cafe)',
    isSend: false,
    message_id: 'synthetic-answer-3',
  },
];

async function openConversation(page: Page, props: Record<string, string> = {}) {
  // A stored session: the chat opens with the conversation, no request is sent.
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
  await expect.poll(async () => (await layout(page)).linkButton).not.toBeNull();
}

function layout(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('.cl-chat-message'));
    const bubbles = rows.map((row) => row.querySelector<HTMLElement>('.cl-user_message, .cl-bot_message')!);
    const style = (element: Element | null) => (element ? getComputedStyle(element) : null);
    const user = style(root.querySelector('.cl-user_message'));
    const bot = style(root.querySelector('.cl-bot_message'));
    const button = root.querySelector<HTMLElement>('.markdown-body > p.cl-link-only > a');
    const listButton = root.querySelector<HTMLElement>('.markdown-body li.cl-link-only > a');
    const looseButton = root.querySelector<HTMLElement>('.markdown-body li.cl-link-only > p > a');
    const inline = root.querySelector<HTMLElement>('.markdown-body p:not(.cl-link-only) a[href*="shop"]');
    const boxes = bubbles.map((bubble) => bubble.getBoundingClientRect());
    return {
      user: user && {
        textAlign: user.textAlign,
        maxWidth: user.maxWidth,
        radius: user.borderTopLeftRadius,
        tail: user.borderBottomRightRadius,
      },
      bot: bot && {
        maxWidth: bot.maxWidth,
        tail: bot.borderBottomLeftRadius,
        border: bot.borderTopWidth,
        shadow: bot.boxShadow,
      },
      // Gaps between bubbles: visitor -> answer, then answer -> answer.
      senderChangeGap: boxes.length > 1 ? boxes[1].top - boxes[0].bottom : null,
      sameSenderGap: boxes.length > 2 ? boxes[2].top - boxes[1].bottom : null,
      linkButton: button && {
        display: getComputedStyle(button).display,
        background: getComputedStyle(button).backgroundColor,
        color: getComputedStyle(button).color,
        underline: getComputedStyle(button).textDecorationLine,
      },
      listButton: listButton && {
        border: getComputedStyle(listButton).borderTopWidth,
        bullet: getComputedStyle(listButton.parentElement!).listStyleType,
      },
      looseButton: looseButton && {
        display: getComputedStyle(looseButton).display,
        border: getComputedStyle(looseButton).borderTopWidth,
        background: getComputedStyle(looseButton).backgroundColor,
        bullet: getComputedStyle(looseButton.closest('li')!).listStyleType,
      },
      inlineLink: inline && {
        color: getComputedStyle(inline).color,
        underline: getComputedStyle(inline).textDecorationLine,
      },
    };
  });
}

test('visitor text reads left to right and bubbles have the quiet shape', async ({ page }) => {
  await openConversation(page);
  const result = await layout(page);
  expect(result.user).toEqual({ textAlign: 'left', maxWidth: '85%', radius: '18px', tail: '6px' });
  expect(result.bot).toEqual({ maxWidth: '85%', tail: '6px', border: '1px', shadow: 'none' });
  // A change of sender gets clearly more room than two answers in a row.
  expect(result.senderChangeGap!).toBeGreaterThanOrEqual(result.sameSenderGap! + 10);
  expect(result.sameSenderGap!).toBeGreaterThanOrEqual(4);
});

test('a link on its own line is a button, a link in a sentence stays a link', async ({ page }) => {
  await openConversation(page);
  const result = await layout(page);
  expect(result.linkButton).toEqual({
    display: 'inline-flex', background: 'rgb(37, 99, 235)', color: 'rgb(255, 255, 255)', underline: 'none',
  });
  expect(result.listButton).toEqual({ border: '1px', bullet: 'none' });
  // A loose list gets the same outlined buttons, not filled ones.
  expect(result.looseButton).toEqual({
    display: 'inline-flex', border: '1px', background: 'rgba(0, 0, 0, 0)', bullet: 'none',
  });
  expect(result.inlineLink).toEqual({ color: 'rgb(29, 78, 216)', underline: 'underline' });
});

test('link buttons use the site colours, and link_color still colours links', async ({ page }) => {
  await openConversation(page, { button_color: '#7c2d12', button_text_color: '#fff7ed', link_color: '#9a3412' });
  const result = await layout(page);
  expect(result.linkButton).toMatchObject({ background: 'rgb(124, 45, 18)', color: 'rgb(255, 247, 237)' });
  expect(result.inlineLink?.color).toBe('rgb(154, 52, 18)');
});

// Tiroler Abend has dark red answers: the theme's blue link would read at 1.6:1,
// so links take the white answer text. On Livigno's light blue answers the blue
// link reads well and stays.
for (const [bubble, textColor, link] of [
  ['#791f0d', '#ffffff', 'rgb(255, 255, 255)'],
  ['#eaf1ff', '#1f2937', 'rgb(29, 78, 216)'],
]) {
  test(`links stay readable on a site's own bubble colour ${bubble}`, async ({ page }) => {
    await openConversation(page, { bot_message_color: bubble, bot_message_text_color: textColor });
    const result = await layout(page);
    expect(result.inlineLink).toEqual({ color: link, underline: 'underline' });
    // The filled link button keeps the accent colour and its white text.
    expect(result.linkButton).toMatchObject({ background: 'rgb(37, 99, 235)', color: 'rgb(255, 255, 255)' });
  });
}

test('the dark theme uses a light link colour and its own accent', async ({ page }) => {
  await openConversation(page, { theme: 'dark' });
  const result = await layout(page);
  expect(result.inlineLink?.color).toBe('rgb(165, 180, 252)');
  expect(result.linkButton).toMatchObject({ background: 'rgb(85, 88, 232)', color: 'rgb(255, 255, 255)' });
});
