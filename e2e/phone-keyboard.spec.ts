import { CDPSession, expect, Page, test } from '@playwright/test';
import {
  edgeGaps, fakeKeyboard, loadWidget, partsOutsideScreen, setKeyboard, waitForInputFocus, waitForSettledBoxes,
} from './widget-helpers';

// Redesign PR 7: the phone keyboard and the safe areas.
// - When the on-screen keyboard opens, the input and the newest message stay
//   visible, the window top does not move, and the page behind does not
//   scroll. On a phone in portrait, the window ends at the keyboard.
// - A touch drag on the window does not scroll the page behind it.
// - On a page with viewport-fit=cover, the trigger and the window clear the
//   notch and the home indicator (env(safe-area-inset-*)).

declare global {
  interface Window {
    __touchMoves: { moves: number; cancelable: number; cancelled: number };
  }
}

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

const phones = ['android', 'iphone', 'narrow-phone', 'phone-landscape'];
const chromiumPhones = ['android', 'narrow-phone'];

// Eight questions and answers: more than the list shows on every phone.
const conversation = Array.from({ length: 8 }, (_, index) => [
  { message: `Question ${index + 1}: when are you open?`, isSend: true },
  {
    message: `Answer ${index + 1}. On Monday we are open from 10:00 to 16:00. On all other days we close at 18:00. The last entry is one hour before closing time.`,
    isSend: false,
    message_id: `answer-${index + 1}`,
  },
]).flat();

async function storeConversation(page: Page) {
  await page.addInitScript((stored) => {
    const now = Date.now();
    localStorage.setItem(`punku-chat-session-${window.location.hostname}-browser-fixture`, JSON.stringify({
      sessionId: 'synthetic-session', messages: stored, createdAt: now, lastActiveAt: now,
      expiresAt: now + 60 * 60 * 1000, domain: window.location.hostname, flowId: 'browser-fixture',
    }));
  }, conversation);
}

async function routeHostPage(page: Page, { cover = false } = {}) {
  // A host page that scrolls, optionally with viewport-fit=cover.
  await page.route(/\/fixture\.html(\?|$)/, async (route) => {
    const response = await route.fetch();
    let body = (await response.text()).replace('<main>', '<div style="height:3000px;background:#dde5ee"></div><main>');
    if (cover) body = body.replace('initial-scale=1"', 'initial-scale=1,viewport-fit=cover"');
    await route.fulfill({ response, body });
  });
}

async function openChat(page: Page, props: Record<string, string> = {}) {
  await loadWidget(page, { start_open: 'true', show_closed_widget_hint: 'false', ...props });
  await waitForInputFocus(page);
  await waitForSettledBoxes(page, ['.cl-chat-window']);
}

async function waitForListAtEnd(page: Page) {
  // The list scrolls smoothly to the newest message when the chat opens. A
  // scroll during that animation does not stay. Wait until it rests at the end.
  let previous = -1;
  await expect.poll(async () => {
    const [top, end] = await page.evaluate(() => {
      const list = window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector<HTMLElement>('.cl-messages_container')!;
      return [list.scrollTop, list.scrollHeight - list.clientHeight];
    });
    const settled = top === previous && Math.abs(end - top) <= 1;
    previous = top;
    return settled;
  }, { intervals: [100] }).toBe(true);
}

function keyboardHeight(projectName: string, height: number) {
  // A phone keyboard covers about 45 % of a portrait screen and 200 px in landscape.
  return projectName === 'phone-landscape' ? 200 : Math.round(height * 0.45);
}

async function layout(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const box = (selector: string) => {
      const element = root.querySelector<HTMLElement>(selector);
      const rect = element?.getBoundingClientRect();
      return rect && rect.height > 0 ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), right: Math.round(rect.right) } : null;
    };
    const messages = root.querySelectorAll('.cl-chat-message');
    const newest = messages[messages.length - 1].getBoundingClientRect();
    const viewport = window.visualViewport!;
    return {
      scrollY: window.scrollY,
      visibleBottom: Math.round(viewport.offsetTop + viewport.height),
      window: box('.cl-chat-window')!,
      card: box('.cl-window')!,
      header: box('.cl-header'),
      list: box('.cl-messages_container')!,
      newestBottom: Math.round(newest.bottom),
    };
  });
}

test.describe('the on-screen keyboard', () => {
  test.beforeEach(({ page }, testInfo) => {
    test.skip(!phones.includes(testInfo.project.name), 'The phone profiles run the keyboard cases.');
  });

  test('keeps the input and the newest message visible, without moving the window top or the page', async ({ page, viewport }, testInfo) => {
    await fakeKeyboard(page, 0);
    await storeConversation(page);
    await routeHostPage(page);
    await openChat(page);
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await layout(page);

    await setKeyboard(page, keyboardHeight(testInfo.project.name, viewport!.height));
    await waitForSettledBoxes(page, ['.cl-chat-window', '.cl-input-element', '.cl-send-button']);
    const open = await layout(page);

    expect(await partsOutsideScreen(page, ['.cl-chat-window', '.cl-input-element', '.cl-send-button'])).toEqual([]);
    // Before PR 7, the newest message slid under the input: 291 px on the iphone profile.
    expect(open.newestBottom).toBeLessThanOrEqual(open.list.bottom + 1);
    expect(open.newestBottom).toBeGreaterThan(open.list.top);
    expect(open.window.top).toBe(before.window.top);
    expect(open.scrollY).toBe(before.scrollY);

    if (testInfo.project.name === 'phone-landscape') {
      // About 140 px stay visible: the header gives its room to the messages.
      // The trigger beside the window still closes it.
      expect(open.header).toBeNull();
      expect(await partsOutsideScreen(page, ['.cl-trigger'])).toEqual([]);
    } else {
      // The window ends at the keyboard, over the trigger, and keeps its close button.
      expect(open.window.bottom).toBe(open.visibleBottom);
      expect(await partsOutsideScreen(page, ['.cl-close-btn'])).toEqual([]);
    }

    // The keyboard closes: the window and the trigger strip come back.
    await setKeyboard(page, 0);
    await waitForSettledBoxes(page, ['.cl-chat-window', '.cl-trigger']);
    const closed = await layout(page);
    expect(closed.window).toEqual(before.window);
    expect(closed.newestBottom).toBeLessThanOrEqual(closed.list.bottom + 1);
  });

  test('keeps the place of a visitor who scrolled up to read', async ({ page, viewport }, testInfo) => {
    await fakeKeyboard(page, 0);
    await storeConversation(page);
    await openChat(page);
    await waitForListAtEnd(page);
    const scrollTop = await page.evaluate(() => {
      const list = window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector<HTMLElement>('.cl-messages_container')!;
      list.scrollTop = 40;
      return list.scrollTop;
    });
    // The list reports the scroll in the next frame.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    await setKeyboard(page, keyboardHeight(testInfo.project.name, viewport!.height));
    await waitForSettledBoxes(page, ['.cl-chat-window']);

    expect(await page.evaluate(() => (
      window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector<HTMLElement>('.cl-messages_container')!.scrollTop
    ))).toBe(scrollTop);
  });

  test('keeps the swarovski phone box: 8 px side margins and 65 px above the keyboard', async ({ page, viewport }, testInfo) => {
    test.skip(testInfo.project.name === 'phone-landscape', 'The phone box applies up to 640 px wide.');
    await fakeKeyboard(page, 0);
    await storeConversation(page);
    await openChat(page, {
      theme: 'swarovski',
      chat_trigger_style: '{"display":"none"}',
      chat_window_style: '{"maxHeight":"550px"}',
      mobile_chat_window_style: '{"bottom":"65px","height":"calc(98vh - 120px)"}',
    });
    const before = await layout(page);
    expect(before.window.left).toBe(8);

    await setKeyboard(page, keyboardHeight(testInfo.project.name, viewport!.height));
    await waitForSettledBoxes(page, ['.cl-chat-window']);
    const open = await layout(page);

    expect([open.window.left, open.window.right]).toEqual([before.window.left, before.window.right]);
    expect(open.visibleBottom - open.window.bottom).toBe(65);
    expect(open.newestBottom).toBeLessThanOrEqual(open.list.bottom + 1);
    expect(await partsOutsideScreen(page, ['.cl-input-element', '.cl-send-button'])).toEqual([]);
  });
});

test.describe('a touch drag on the window', () => {
  // Playwright sends touch moves only to Chromium (CDP).
  test.beforeEach(({ page }, testInfo) => {
    test.skip(!chromiumPhones.includes(testInfo.project.name), 'The Chromium phone profiles run the touch drags.');
  });

  // One finger moves yDistance px (negative is up) from `point` in 12 moves,
  // one per frame. Input.dispatchTouchEvent goes through the browser's own
  // touch and scroll handling. Input.synthesizeScrollGesture does not: in the
  // Linux CI image it sends no touchmove and scrolls nothing, not even the
  // host page, so every "the page did not scroll" check passed for nothing.
  // `sideways`: the first sample goes 20 px sideways and 10 px along, as at
  // the start of a fast diagonal thumb flick, and the finger then drifts
  // 24 px sideways in all. Chromium does not pass moves inside its touch slop
  // (about 15 px) to the page, so a smaller first sample would never reach
  // the widget here; iOS passes them all.
  async function drag(page: Page, cdp: CDPSession, point: { x: number; y: number }, yDistance: number, { sideways = false } = {}) {
    await page.evaluate(() => { window.__touchMoves = { moves: 0, cancelable: 0, cancelled: 0 }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    if (sideways) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 20, y: point.y + 10 * Math.sign(yDistance) }] });
      await page.waitForTimeout(16);
    }
    for (let step = 1; step <= 12; step += 1) {
      const x = point.x + (sideways ? 20 + (4 * step) / 12 : 0);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: point.y + (yDistance * step) / 12 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // Wait until a fling ends: the page and the list keep their place in two reads.
    let previous = '';
    await expect.poll(async () => {
      const current = await page.evaluate(() => {
        const list = window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector<HTMLElement>('.cl-messages_container')!;
        return `${window.scrollY},${list.scrollTop}`;
      });
      const settled = current === previous;
      previous = current;
      return settled;
    }, { intervals: [150] }).toBe(true);
    return page.evaluate(() => window.__touchMoves);
  }

  // Count the touch moves, the ones the widget could cancel, and the ones it
  // cancelled. On iOS a cancelled move stops scrolling for the rest of the
  // touch; Chromium scrolls after a later move, so the count shows what iOS
  // would do. Chromium merges moves while it scrolls, so the number of moves
  // varies. The count is read after each dispatch, when every listener has run.
  async function countTouchMoves(page: Page) {
    await page.addInitScript(() => {
      window.__touchMoves = { moves: 0, cancelable: 0, cancelled: 0 };
      window.addEventListener('touchmove', (event) => {
        setTimeout(() => {
          window.__touchMoves.moves += 1;
          if (event.cancelable) window.__touchMoves.cancelable += 1;
          if (event.defaultPrevented) window.__touchMoves.cancelled += 1;
        });
      }, { capture: true, passive: true });
    });
  }

  const pointIn = (page: Page, selector: string) => page.evaluate((selector) => {
    const box = window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector(selector)!.getBoundingClientRect();
    return { x: Math.round(box.left + box.width / 3), y: Math.round(box.top + box.height / 2) };
  }, selector);

  const listScrollTop = (page: Page) => page.evaluate(() => (
    window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector<HTMLElement>('.cl-messages_container')!.scrollTop
  ));

  for (const keyboard of [false, true]) {
    test(`does not scroll the page behind${keyboard ? ' with the keyboard open' : ''}`, async ({ page, viewport }) => {
      await fakeKeyboard(page, 0);
      await countTouchMoves(page);
      await storeConversation(page);
      await routeHostPage(page);
      await openChat(page);
      await waitForListAtEnd(page);
      await page.evaluate(() => window.scrollTo(0, 400));
      if (keyboard) {
        await setKeyboard(page, Math.round(viewport!.height * 0.45));
        await waitForSettledBoxes(page, ['.cl-chat-window']);
      }
      const cdp = await page.context().newCDPSession(page);

      // Before PR 7, a drag up on the header scrolled the page by 200 px.
      // Check after each drag: a drag up and a drag down can cancel out.
      expect((await drag(page, cdp, await pointIn(page, '.cl-header'), -200)).cancelled).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(400);
      expect((await drag(page, cdp, await pointIn(page, '.cl-header'), 200)).cancelled).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(400);
      // The field's text fits, so the field cannot scroll: nor does the page.
      // Chromium does not pass this drag to the page anyway; iOS pans the
      // visible area unless the moves are cancelled.
      expect((await drag(page, cdp, await pointIn(page, '.cl-input-element'), -150)).cancelled).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(400);
      // The list is at its end: a drag up cannot scroll it further.
      expect((await drag(page, cdp, await pointIn(page, '.cl-messages_container'), -200)).cancelled).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(400);

      // A drag down scrolls the list back, not the page.
      const end = await listScrollTop(page);
      expect(await drag(page, cdp, await pointIn(page, '.cl-messages_container'), 150)).toMatchObject({ cancelled: 0 });
      expect(await listScrollTop(page)).toBeLessThan(end);
      expect(await page.evaluate(() => window.scrollY)).toBe(400);

      // A flick that starts sideways scrolls the list too, and no move of it
      // is cancelled. The list cannot scroll sideways, so the first sample
      // alone must not decide the flick.
      const before = await listScrollTop(page);
      const flick = await drag(page, cdp, await pointIn(page, '.cl-messages_container'), 150, { sideways: true });
      expect(flick.cancelable).toBeGreaterThan(0);
      expect(flick.cancelled).toBe(0);
      expect(await listScrollTop(page)).toBeLessThan(before - 50);
      expect(await page.evaluate(() => window.scrollY)).toBe(400);

      // Control: the same drag on the host page above the window scrolls the
      // page, so the checks above did test touch scrolling.
      await drag(page, cdp, { x: 30, y: 30 }, -200);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    });
  }
});

test.describe('safe areas on a page with viewport-fit=cover', () => {
  // Chromium can emulate the insets of a notch and a home indicator.
  test.beforeEach(({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'android', 'The android profile emulates the safe areas (CDP).');
  });

  async function emulateInsets(page: Page, insets: { top: number; right: number; bottom: number; left: number }) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
  }

  test.describe('in portrait', () => {
    // An iPhone 15: 59 px for the Dynamic Island, 34 px for the home indicator.
    const insets = { top: 59, right: 0, bottom: 34, left: 0 };

    test('the trigger clears the home indicator', async ({ page }) => {
      await emulateInsets(page, insets);
      await routeHostPage(page, { cover: true });
      await loadWidget(page, { show_closed_widget_hint: 'false' });
      await waitForSettledBoxes(page, ['.cl-trigger']);
      expect((await edgeGaps(page, '.cl-trigger')).layout).toMatchObject({ right: 20, bottom: 54 });
    });

    test('the window starts at top_offset, and its content below the island', async ({ page, viewport }) => {
      await emulateInsets(page, insets);
      await routeHostPage(page, { cover: true });
      await openChat(page);
      const open = await layout(page);
      // top_offset (60 px) already clears the 59 px island: no extra padding.
      expect(open.window.top).toBe(60);
      expect(open.card.top).toBe(60);
      // 80 px for the trigger over the 34 px home indicator.
      expect(viewport!.height - open.window.bottom).toBe(114);
      const trigger = await edgeGaps(page, '.cl-trigger');
      expect(trigger.layout.bottom).toBe(54);
    });

    test('top_offset 0 keeps the window at the top and its header below the island', async ({ page }) => {
      await emulateInsets(page, insets);
      await routeHostPage(page, { cover: true });
      await openChat(page, { top_offset: '0' });
      const open = await layout(page);
      expect(open.window.top).toBe(0);
      expect(open.header!.top).toBe(59);
    });

    test('with the keyboard open, the window ends at the keyboard', async ({ page, viewport }) => {
      await emulateInsets(page, insets);
      await fakeKeyboard(page, 0);
      await routeHostPage(page, { cover: true });
      await openChat(page);
      await setKeyboard(page, Math.round(viewport!.height * 0.45));
      await waitForSettledBoxes(page, ['.cl-chat-window']);
      const open = await layout(page);
      expect(open.window.bottom).toBe(open.visibleBottom);
    });
  });

  test.describe('in landscape', () => {
    // A phone on its side: the notch on one side, the home indicator below.
    test.use({ viewport: { width: 839, height: 412 } });
    const insets = { top: 0, right: 59, bottom: 21, left: 59 };

    test('the trigger and the window beside it clear the notch and the home indicator', async ({ page }) => {
      await emulateInsets(page, insets);
      await routeHostPage(page, { cover: true });
      await openChat(page);
      await waitForSettledBoxes(page, ['.cl-chat-window', '.cl-trigger']);

      const trigger = await edgeGaps(page, '.cl-trigger');
      expect(trigger.layout).toMatchObject({ right: 79, bottom: 41 });
      const open = await layout(page);
      const triggerLeft = await page.evaluate(() => (
        window.__widgetRoots.get(document.querySelector('punku-chat')!)!.querySelector('.cl-trigger')!.getBoundingClientRect().left
      ));
      expect(open.window.right).toBeLessThanOrEqual(Math.round(triggerLeft) - 12);
      expect(open.window.left).toBeGreaterThanOrEqual(59);
      expect(open.window.top).toBe(8);
      expect(await partsOutsideScreen(page, ['.cl-chat-window', '.cl-header', '.cl-send-button', '.cl-trigger'])).toEqual([]);
    });
  });
});
