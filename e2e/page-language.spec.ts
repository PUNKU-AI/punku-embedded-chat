import { expect, Page, test } from '@playwright/test';
import { translations } from '../src/translations';
import { loadWidget } from './widget-helpers';

// Without default_language the built-in texts follow the page language
// (<html lang>), before the browser language. The browser here is English, so
// an Italian chat proves that the page language wins. An explicit
// default_language still wins over both.

test.use({ locale: 'en-US' });

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function setPageLanguage(page: Page, lang: string) {
  await page.route(/\/fixture\.html(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('<html lang="en">', `<html lang="${lang}">`);
    await route.fulfill({ response, body });
  });
}

async function openChat(page: Page, props: Record<string, string>) {
  await loadWidget(page, {
    start_open: 'true', width: '360', height: '520', enable_client_error_reporting: 'false',
    show_closed_widget_hint: 'false', ...props,
  });
  await expect.poll(() => texts(page).then((result) => result.placeholder)).toBeTruthy();
}

function texts(page: Page) {
  return page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    return {
      lang: document.documentElement.lang,
      notice: root.querySelector('.cl-ai-notice')?.textContent ?? null,
      placeholder: root.querySelector<HTMLTextAreaElement>('.cl-input-element')?.placeholder ?? null,
      error: root.querySelector('.cl-error_message .cl-error-text')?.textContent ?? null,
      retry: root.querySelector('.cl-retry-btn')?.textContent ?? null,
    };
  });
}

async function sendAndFail(page: Page) {
  await page.route('**/api/v1/run/**', (route) =>
    route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error: synthetic failure' }));
  // A script focus works in every engine: WebKit cannot click into the closed root.
  await expect.poll(() => page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const field = root.querySelector<HTMLTextAreaElement>('.cl-input-element');
    if (root.activeElement !== field) field?.focus({ preventScroll: true });
    return root.activeElement === field;
  })).toBe(true);
  await page.keyboard.type('Quando apre il museo?');
  await page.keyboard.press('Enter');
  await expect.poll(() => texts(page).then((result) => result.error)).toBeTruthy();
}

test('an Italian page without default_language shows the Italian texts', async ({ page }) => {
  await setPageLanguage(page, 'it-IT');
  await openChat(page, { unset: 'default_language' });
  const it = translations.it;

  expect(await texts(page)).toMatchObject({ lang: 'it-IT', notice: it.aiNotice, placeholder: it.placeholder });

  await sendAndFail(page);
  expect(await texts(page)).toMatchObject({ error: it.errorServer, retry: it.retry });
});

test('an explicit default_language wins over the page language', async ({ page }) => {
  await setPageLanguage(page, 'it');
  await openChat(page, { default_language: 'en' });

  expect(await texts(page)).toMatchObject({ notice: translations.en.aiNotice, placeholder: translations.en.placeholder });
});

test('a page language the widget does not have falls back to the browser language', async ({ page }) => {
  await setPageLanguage(page, 'nl');
  await openChat(page, { unset: 'default_language' });

  expect(await texts(page)).toMatchObject({ notice: translations.en.aiNotice, placeholder: translations.en.placeholder });
});
