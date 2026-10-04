import { test, expect, Page, TestInfo } from '@playwright/test';
import { loadWidget } from './widget-helpers';

declare global {
  interface Window {
    __hintFixture: {
      widgets: HTMLElement[];
      wrappers: HTMLElement[];
      outerHosts: HTMLElement[];
      addWidget: (attrs?: Record<string, string>, styles?: Record<string, string>, className?: string) => HTMLElement;
    };
  }
}

const errors = new WeakMap<Page, string[]>();
const apiRequests = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const currentErrors: string[] = [];
  const currentRequests: string[] = [];
  errors.set(page, currentErrors);
  apiRequests.set(page, currentRequests);
  page.on('pageerror', (error) => currentErrors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) currentRequests.push(request.url());
  });
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(apiRequests.get(page)).toEqual([]);
});

async function states(page: Page) {
  return page.evaluate(() => window.__hintFixture.widgets.map((host) => {
    const root = window.__widgetRoots.get(host);
    const hint = root?.querySelector<HTMLElement>('.cl-closed-widget-hint');
    const trigger = root?.querySelector<HTMLElement>('.cl-trigger');
    const windowElement = root?.querySelector<HTMLElement>('.cl-chat-window');
    const windowRect = windowElement?.getBoundingClientRect();
    const icon = root?.querySelector<HTMLImageElement>('.cl-trigger-img');
    const headerIcon = root?.querySelector<HTMLImageElement>('.cl-header-logo');
    const rect = hint?.getBoundingClientRect();
    const style = hint && getComputedStyle(hint);
    let ancestorsVisible = true;
    let ancestor: Element | null = trigger || null;
    while (ancestor) {
      const ancestorStyle = getComputedStyle(ancestor);
      if (ancestorStyle.display === 'none' || ancestorStyle.visibility === 'hidden' || Number(ancestorStyle.opacity) === 0) {
        ancestorsVisible = false;
      }
      const tree = ancestor.getRootNode();
      ancestor = ancestor.parentElement || (tree instanceof ShadowRoot ? tree.host : null);
    }
    const triggerRect = trigger?.getBoundingClientRect();
    const triggerVisible = !!triggerRect && ancestorsVisible && triggerRect.width > 0 && triggerRect.height > 0 &&
      triggerRect.right > 0 && triggerRect.bottom > 0 && triggerRect.left < window.innerWidth && triggerRect.top < window.innerHeight;
    const key = 'punku-chat-hint-shown-' + window.location.hostname + '-' + host.getAttribute('flow_id');
    return {
      loaded: !!trigger,
      connected: host.isConnected,
      triggerVisible,
      hintExists: !!hint,
      hintVisible: !!rect && triggerVisible && rect.width > 0 && rect.height > 0 && Number(style?.opacity) === 1 &&
        style?.visibility === 'visible' && style?.display !== 'none',
      opacity: style ? Number(style.opacity) : null,
      ariaHidden: hint?.getAttribute('aria-hidden') ?? null,
      text: hint?.textContent ?? null,
      color: style?.color ?? null,
      background: style?.backgroundColor ?? null,
      className: hint?.className ?? null,
      rect: rect ? { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      storedShown: sessionStorage.getItem(key),
      chatVisible: !!windowRect && windowRect.width > 0.5 && windowRect.height > 0.5 &&
        getComputedStyle(windowElement!).visibility === 'visible',
      iconLoaded: !!icon && icon.complete && icon.naturalWidth > 0,
      iconSource: icon?.getAttribute('src') ?? null,
      headerIconLoaded: !!headerIcon && headerIcon.complete && headerIcon.naturalWidth > 0,
      headerIconSource: headerIcon?.getAttribute('src') ?? null,
      publicRoot: host.shadowRoot !== null,
    };
  }));
}

async function loadHints(page: Page, props: Record<string, string>) {
  await loadWidget(page, props, '/hint-fixture.html');
  await expect.poll(async () => (await states(page)).every((state) => state.loaded)).toBe(true);
  expect((await states(page)).every((state) => !state.publicRoot)).toBe(true);
}

async function expectVisible(page: Page, index: number) {
  await expect.poll(async () => (await states(page))[index]?.hintVisible, { intervals: [25, 50] }).toBe(true);
  const viewport = page.viewportSize()!;
  await expect.poll(async () => {
    const rect = (await states(page))[index]?.rect;
    return !!rect && rect.x >= 0 && rect.y >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height;
  }, { message: 'The visible hint must fit inside the viewport.' }).toBe(true);
  expect((await states(page))[index].ariaHidden).toBe('false');
}

async function clickWidget(page: Page, index: number, hasTouch: boolean) {
  const handle = await page.evaluateHandle((index) => {
    const host = window.__hintFixture.widgets[index];
    return window.__widgetRoots.get(host)?.querySelector('.cl-trigger');
  }, index);
  const element = handle.asElement();
  expect(element).not.toBeNull();
  try {
    if (hasTouch) await element!.tap();
    else await element!.click();
  } finally {
    await handle.dispose();
  }
}

async function waitElapsed(page: Page, started: number, milliseconds: number) {
  await expect.poll(() => page.evaluate((started) => performance.now() - started, started), {
    timeout: milliseconds + 1500,
    intervals: [25, 50],
  }).toBeGreaterThanOrEqual(milliseconds);
}

async function screenshot(page: Page, testInfo: TestInfo, profile: string) {
  const filename = testInfo.outputPath(`customer-hint-${profile}.png`);
  await page.screenshot({ path: filename });
  await testInfo.attach(`customer-hint-${profile}`, { path: filename, contentType: 'image/png' });
}

const profiles = [
  { name: 'wimsi', text: 'Hallo, ich bin dein KI-Assistent. Wie kann ich dir helfen?', color: '#3aaa35' },
  { name: 'laura', text: 'Hallo, ich bin Laura. Wie kann ich dir helfen?' },
  { name: 'lancillotto', text: "Ciao, sono Lancillotto e vi guiderò all'acquisto dei vostri biglietti" },
  { name: 'stadthafen-marina', text: 'Lust aufs Wasser? \ud83d\udea3 Frag Marina!', textColor: 'rgb(0, 58, 93)' },
  { name: 'franco', text: "Let's Plan Your Ski Holiday" },
  { name: 'fiete', text: 'Moin! Ich bin Fiete und helfe dir rund um deinen Besuch im Dialoghaus.', textColor: 'rgb(74, 74, 74)', background: 'rgb(255, 247, 214)' },
  { name: 'timeride', disabled: true },
  { name: 'elixia', disabled: true },
  { name: 'scheibenholz', disabled: true },
];

for (const profile of profiles) {
  test(`customer profile ${profile.name}: hint, icons, bounds, and native chat controls`, async ({ page, hasTouch }, testInfo) => {
    await loadHints(page, { profile: profile.name });
    const initial = await states(page);
    // Franco has two coincident visible triggers. Use the topmost native control.
    const index = initial.map((state, index) => state.triggerVisible ? index : -1).filter((index) => index >= 0).pop() ?? -1;
    expect(index).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => (await states(page))[index].iconLoaded).toBe(true);
    await expect.poll(async () => (await states(page))[index].headerIconLoaded).toBe(true);
    if (profile.disabled) {
      expect(initial.every((state) => !state.hintExists && state.storedShown === null)).toBe(true);
    } else {
      await expect.poll(async () => (await states(page)).filter((state) => state.hintVisible).length).toBe(1);
      const hintIndex = (await states(page)).findIndex((state) => state.hintVisible);
      await expectVisible(page, hintIndex);
      const visible = (await states(page))[hintIndex];
      expect(visible.text).toBe(profile.text);
      expect(visible.storedShown).toBe('true');
      if (profile.textColor) expect(visible.color).toBe(profile.textColor);
      if (profile.background) expect(visible.background).toBe(profile.background);
      if (profile.color) {
        expect(decodeURIComponent(visible.iconSource!)).toContain(`fill="${profile.color}"`);
        expect(visible.headerIconSource).toBe(visible.iconSource);
      }
      expect((await states(page)).filter((state) => state.hintVisible)).toHaveLength(1);
    }
    await screenshot(page, testInfo, profile.name);
    await clickWidget(page, index, hasTouch);
    await expect.poll(async () => (await states(page))[index].chatVisible).toBe(true);
    await expect.poll(async () => (await states(page))[index].hintExists).toBe(false);
    await clickWidget(page, index, hasTouch);
    await expect.poll(async () => (await states(page))[index].chatVisible).toBe(false);
    if (!profile.disabled) await expect.poll(async () => (await states(page))[index].opacity).toBe(0);
    expect((await states(page)).every((state) => state.iconLoaded)).toBe(true);
  });
}

test('Fiete mobile-first hidden embed does not consume the desktop hint', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await loadHints(page, { scene: 'responsive-mobile-first' });
  await expectVisible(page, 1);
  expect((await states(page))[0].triggerVisible).toBe(false);
  expect((await states(page))[0].hintVisible).toBe(false);
  expect((await states(page))[1].storedShown).toBe('true');
});

test('desktop-first hidden embed does not consume the phone hint', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadHints(page, { scene: 'responsive-desktop-first' });
  await expectVisible(page, 1);
  expect((await states(page))[0].triggerVisible).toBe(false);
  expect((await states(page))[0].hintVisible).toBe(false);
});

test('responsive switch does not repeat a consumed hint', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await loadHints(page, { scene: 'responsive-mobile-first' });
  await expectVisible(page, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot();
  await expect.poll(async () => (await states(page))[0].triggerVisible).toBe(true);
  await expect.poll(async () => (await states(page)).some((state) => state.hintVisible)).toBe(false);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot();
  await expect.poll(async () => (await states(page))[1].triggerVisible).toBe(true);
  // The desktop exposure already owns its timer. Returning does not create another exposure.
  expect((await states(page))[0].opacity).toBe(0);
});

test('both hidden embeds retain the flag and full timer until a class reveals one', async ({ page }) => {
  await loadHints(page, { scene: 'both-hidden', timer: '1200' });
  const hiddenAt = await page.evaluate(() => performance.now());
  await waitElapsed(page, hiddenAt, 1600);
  expect((await states(page)).every((state) => state.storedShown === null && !state.hintVisible)).toBe(true);
  await page.evaluate(() => window.__hintFixture.wrappers[0].classList.remove('hidden'));
  await expectVisible(page, 0);
  const visibleAt = await page.evaluate(() => performance.now());
  await waitElapsed(page, visibleAt, 300);
  expect((await states(page))[0].hintVisible).toBe(true);
  await expect.poll(async () => (await states(page))[0].opacity, { timeout: 2000 }).toBe(0);
  await page.evaluate(() => { window.__hintFixture.wrappers[1].style.display = ''; });
  await expect.poll(async () => (await states(page))[1].triggerVisible).toBe(true);
  expect((await states(page))[1].opacity).toBe(0);
});

for (const scene of ['ancestor-hidden', 'ancestor-transparent']) {
  test(`${scene}: inline style reveal starts the first exposure`, async ({ page }) => {
    await loadHints(page, { scene, timer: '700' });
    const hiddenAt = await page.evaluate(() => performance.now());
    await waitElapsed(page, hiddenAt, 1100);
    expect((await states(page))[0].storedShown).toBeNull();
    expect((await states(page))[0].hintVisible).toBe(false);
    await page.evaluate(() => {
      window.__hintFixture.wrappers[0].style.visibility = 'visible';
      window.__hintFixture.wrappers[0].style.opacity = '1';
    });
    await expectVisible(page, 0);
    expect((await states(page))[0].storedShown).toBe('true');
    await expect.poll(async () => (await states(page))[0].opacity, { timeout: 2000 }).toBe(0);
  });
}

test('closed ancestor shadow host waits for actual exposure', async ({ page }) => {
  await loadHints(page, { scene: 'shadow-host', timer: '700' });
  expect(await page.evaluate(() => window.__hintFixture.outerHosts[0].shadowRoot)).toBeNull();
  const hiddenAt = await page.evaluate(() => performance.now());
  await waitElapsed(page, hiddenAt, 1100);
  expect((await states(page))[0].storedShown).toBeNull();
  await page.evaluate(() => { window.__hintFixture.outerHosts[0].style.display = 'block'; });
  await expectVisible(page, 0);
  expect((await states(page))[1].hintExists).toBe(false);
  await expect.poll(async () => (await states(page))[0].opacity, { timeout: 2000 }).toBe(0);
});

test('stylesheet display reveal starts the first exposure', async ({ page }) => {
  await loadHints(page, { scene: 'stylesheet-hidden', timer: '700' });
  const hiddenAt = await page.evaluate(() => performance.now());
  await waitElapsed(page, hiddenAt, 1100);
  expect((await states(page))[0].storedShown).toBeNull();
  await page.evaluate(() => {
    document.getElementById('fixture-visibility-style')!.textContent = '.style-gate { display: block; }';
  });
  await expectVisible(page, 0);
  await expect.poll(async () => (await states(page))[0].opacity, { timeout: 2000 }).toBe(0);
});

test('Wimsi keeps its hint visible without an automatic timeout', async ({ page }) => {
  await loadHints(page, { profile: 'wimsi' });
  await expectVisible(page, 0);
  const visibleAt = await page.evaluate(() => performance.now());
  await waitElapsed(page, visibleAt, 1400);
  expect((await states(page))[0].hintVisible).toBe(true);
});

test('visible duplicate embeds share one shown flag', async ({ page }) => {
  await loadHints(page, { scene: 'duplicate-visible' });
  await expect.poll(async () => (await states(page)).filter((state) => state.hintVisible).length).toBe(1);
  expect((await states(page)).every((state) => state.storedShown === 'true')).toBe(true);
  expect((await states(page)).every((state) => state.triggerVisible)).toBe(true);
});

test('independent flows both show their hints', async ({ page }) => {
  await loadHints(page, { scene: 'independent-flows' });
  await expectVisible(page, 0);
  await expectVisible(page, 1);
  expect((await states(page)).filter((state) => state.hintVisible)).toHaveLength(2);
});

test('blank hint text does not consume a shown flag', async ({ page }) => {
  await loadHints(page, { scene: 'blank' });
  expect((await states(page))[0].hintExists).toBe(false);
  expect((await states(page))[0].storedShown).toBeNull();
});

test('repeat-enabled hint returns after native close and reload', async ({ page, hasTouch }) => {
  await loadHints(page, { scene: 'repeat', timer: '1200' });
  await expectVisible(page, 0);
  expect((await states(page))[0].storedShown).toBeNull();
  await clickWidget(page, 0, hasTouch);
  await expect.poll(async () => (await states(page))[0].hintExists).toBe(false);
  await clickWidget(page, 0, hasTouch);
  await expectVisible(page, 0);
  await page.reload();
  await expectVisible(page, 0);
  expect((await states(page))[0].storedShown).toBeNull();
});

test('show-once hint stays consumed after expiry, native close, and same-tab reload', async ({ page, hasTouch }) => {
  await loadHints(page, { scene: 'single', timer: '700' });
  await expectVisible(page, 0);
  await expect.poll(async () => (await states(page))[0].opacity, { timeout: 2000 }).toBe(0);
  await clickWidget(page, 0, hasTouch);
  await expect.poll(async () => (await states(page))[0].hintExists).toBe(false);
  await clickWidget(page, 0, hasTouch);
  await expect.poll(async () => (await states(page))[0].opacity).toBe(0);
  await page.reload();
  await expect.poll(async () => (await states(page))[0]?.loaded).toBe(true);
  expect((await states(page))[0].storedShown).toBe('true');
  expect((await states(page))[0].opacity).toBe(0);
});

test('resize keeps the original exposure deadline', async ({ page }) => {
  await loadHints(page, { scene: 'single', timer: '1200' });
  await expectVisible(page, 0);
  const visibleAt = await page.evaluate(() => performance.now());
  await waitElapsed(page, visibleAt, 600);
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width + 1, height: viewport.height });
  await page.screenshot();
  await waitElapsed(page, visibleAt, 1350);
  await expect.poll(async () => (await states(page))[0].opacity, { timeout: 250, intervals: [25] }).toBe(0);
});

test('removing an unexposed embed leaves the other embed eligible', async ({ page }) => {
  await loadHints(page, { scene: 'unmount', timer: '700' });
  await page.evaluate(() => window.__hintFixture.wrappers[0].remove());
  const removedAt = await page.evaluate(() => performance.now());
  await waitElapsed(page, removedAt, 1100);
  expect((await states(page))[0].connected).toBe(false);
  expect((await states(page))[1].storedShown).toBeNull();
  await page.evaluate(() => window.__hintFixture.wrappers[1].classList.remove('hidden'));
  await expectVisible(page, 1);
  await expect.poll(async () => (await states(page))[1].opacity, { timeout: 2000 }).toBe(0);
});
