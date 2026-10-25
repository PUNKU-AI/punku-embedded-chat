import { expect, Page, test } from '@playwright/test';
import { loadWidget } from './widget-helpers';

// Every built-in theme reads at WCAG AA in the browser: each visible text at
// 4.5:1 on the colour behind it (1.4.3), each icon and control at 3:1
// (1.4.11). The pages show a conversation with a link and link buttons, a
// typed question, an error with Try again, and the suggestions. The swarovski
// theme keeps the look of the swarovski-widget branch (swarovski-look.spec.ts)
// and is not measured here. The unit test themeContrast.test.tsx checks the
// same colours in the stylesheet, also on hover.

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
  { message: 'Do you have family tickets for Saturday?', isSend: true },
  {
    message: 'Yes. See [our prices](https://example.com/prices) first.\n\n'
      + '[Book family tickets](https://example.com/book)\n\n'
      + '- [Directions and parking](https://example.com/directions)\n- [Gift vouchers](https://example.com/gifts)',
    isSend: false,
    message_id: 'synthetic-answer',
  },
];

async function openTheme(page: Page, theme: string, props: Record<string, string> = {}, stored = false) {
  // No fade: the colours are measured at once, not halfway through it.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (stored) {
    await page.addInitScript((messages) => {
      const now = Date.now();
      localStorage.setItem(`punku-chat-session-${window.location.hostname}-browser-fixture`, JSON.stringify({
        sessionId: 'synthetic-session', messages, createdAt: now, lastActiveAt: now,
        expiresAt: now + 60 * 60 * 1000, domain: window.location.hostname, flowId: 'browser-fixture',
      }));
    }, conversation);
  }
  await page.route('**/api/v1/run/**', (route) => route.fulfill({
    status: 500, contentType: 'text/plain', body: 'Internal Server Error: synthetic failure',
  }));
  await loadWidget(page, {
    theme, start_open: 'true', show_closed_widget_hint: 'false', width: '380', height: '640',
    enable_client_error_reporting: 'false', ...props,
  });
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    const field = root.querySelector<HTMLTextAreaElement>('.cl-input-element');
    if (root.activeElement !== field) field?.focus({ preventScroll: true });
    return root.activeElement === field;
  })).toBe(true);
}

type Finding = { what: string; foreground: string; background: string; ratio: number; minimum: number };

/** Every visible text, icon and control boundary below its WCAG AA minimum. */
function lowContrast(page: Page) {
  return page.evaluate((): Finding[] => {
    const root = window.__widgetRoots.get(document.querySelector('punku-chat')!)!;
    type Paint = { rgb: number[]; alpha: number };
    const parse = (value: string | null): Paint | null => {
      if (!value) return null;
      const rgb = /^rgba?\(([^)]+)\)$/.exec(value.trim());
      if (rgb) {
        const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
      }
      const srgb = /^color\(srgb ([^)]+)\)$/.exec(value.trim());
      if (srgb) {
        const parts = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number);
        return { rgb: parts.slice(0, 3).map((channel) => Math.round(channel * 255)), alpha: parts.length > 3 ? parts[3] : 1 };
      }
      return null;
    };
    const over = (top: number[], alpha: number, back: number[]) =>
      top.map((channel, index) => Math.round(channel * alpha + back[index] * (1 - alpha)));
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number[], b: number[]) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (light + 0.05) / (dark + 0.05);
    };
    const hex = (rgb: number[]) => '#' + rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('');
    const stops = (image: string) => (image.match(/rgba?\([^)]+\)|color\(srgb[^)]+\)/g) || [])
      .map(parse).filter((paint): paint is Paint => !!paint);
    const parentOf = (node: Element) => node.parentElement || ((node.parentNode as ShadowRoot | null)?.host ?? null);

    // Each opaque colour that can show behind an element: one per gradient stop.
    const backdrops = (element: Element, fromParent = false): number[][] => {
      const layers: Paint[][] = [];
      for (let node = fromParent ? parentOf(element) : element; node; node = parentOf(node)) {
        const style = getComputedStyle(node);
        if (/gradient/.test(style.backgroundImage)) {
          const gradient = stops(style.backgroundImage);
          layers.push(gradient);
          if (gradient.every((stop) => stop.alpha >= 0.999)) break;
        }
        const color = parse(style.backgroundColor);
        if (color && color.alpha > 0) {
          layers.push([color]);
          if (color.alpha >= 0.999) break;
        }
      }
      let results = [[255, 255, 255]];
      for (const layer of layers.reverse()) {
        results = results.flatMap((back) => layer.map((stop) => over(stop.rgb, stop.alpha, back)));
      }
      return results;
    };
    // The opacity between an element and the layer that paints behind it.
    const opacity = (element: Element) => {
      let product = 1;
      for (let node: Element | null = element; node; node = parentOf(node)) {
        const style = getComputedStyle(node);
        const fill = parse(style.backgroundColor);
        if ((fill && fill.alpha > 0) || /gradient/.test(style.backgroundImage)) break;
        product *= Number(style.opacity);
      }
      return product;
    };
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return false;
      for (let node: Element | null = element; node; node = parentOf(node)) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return false;
        if (node.classList.contains('cl-sr-only')) return false;
      }
      return true;
    };

    const findings: Finding[] = [];
    const check = (what: string, paint: Paint | null, behind: number[][], minimum: number) => {
      if (!paint || paint.alpha === 0) return;
      for (const back of behind) {
        const shown = paint.alpha >= 0.999 ? paint.rgb : over(paint.rgb, paint.alpha, back);
        const value = Math.round(ratio(shown, back) * 100) / 100;
        if (value < minimum) findings.push({ what, foreground: hex(shown), background: hex(back), ratio: value, minimum });
      }
    };

    // Text: each element with its own visible text, and the placeholder.
    for (const element of Array.from(root.querySelectorAll('*'))) {
      if (element.closest('style, svg')) continue;
      const text = Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent?.trim() ?? '').join(' ').trim();
      if (!text || !visible(element)) continue;
      const color = parse(getComputedStyle(element).color);
      if (color) check(`text "${text.slice(0, 30)}"`, { ...color, alpha: color.alpha * opacity(element) }, backdrops(element), 4.5);
    }
    const field = root.querySelector('.cl-input-element') as HTMLTextAreaElement | null;
    if (field && !field.value && visible(field)) {
      check('placeholder', parse(getComputedStyle(field, '::placeholder').color), backdrops(field), 4.5);
    }
    // Icons: the colour that paints each icon, on what is behind it.
    for (const svg of Array.from(root.querySelectorAll('svg'))) {
      if (!visible(svg)) continue;
      const shape = svg.querySelector('path, circle, rect, line, polyline');
      const style = getComputedStyle(shape || svg);
      const paint = parse(style.stroke && style.stroke !== 'none' ? style.stroke : style.fill);
      const host = svg.closest('button, a, div[class]');
      check(`icon in ${host?.className || 'the window'}`, paint && { ...paint, alpha: paint.alpha * opacity(svg) }, backdrops(svg), 3);
    }
    // Controls: the fill or the border (whichever stands out more) against the surface behind.
    const controls: Array<[string, string]> = [
      ['.cl-send-button:not(:disabled)', 'send button'],
      ['.cl-suggestion', 'suggestion'],
      ['.markdown-body > p.cl-link-only > a', 'filled link button'],
      ['.markdown-body li.cl-link-only > a', 'outlined link button'],
      ['.cl-retry-btn', 'Try again'],
      ['.cl-composer-field:focus-within', 'focused input field'],
    ];
    for (const [selector, what] of controls) {
      for (const element of Array.from(root.querySelectorAll(selector))) {
        if (!visible(element)) continue;
        const style = getComputedStyle(element);
        const behind = backdrops(element, true);
        const parts = [
          ...(/gradient/.test(style.backgroundImage) ? [stops(style.backgroundImage)] : []),
          [parse(style.backgroundColor)],
          ...(parseFloat(style.borderTopWidth) >= 1 ? [[parse(style.borderTopColor)]] : []),
        ].map((part) => part.filter((paint): paint is Paint => !!paint && paint.alpha > 0)).filter((part) => part.length > 0);
        // The part with the best worst case marks the control.
        let best: Finding[] | null = null;
        for (const part of parts) {
          const before = findings.length;
          for (const paint of part) check(what, paint, behind, 3);
          const failed = findings.splice(before);
          if (!best || failed.length < best.length) best = failed;
        }
        findings.push(...(best ?? [{ what, foreground: 'none', background: hex(behind[0]), ratio: 1, minimum: 3 }]));
      }
    }
    return findings;
  });
}

for (const theme of ['default', 'dark', 'ocean', 'aurora', 'punku-ai-bookingkit']) {
  test(`the ${theme} theme reads at WCAG AA: answers, link buttons, the input and an error`, async ({ page }) => {
    await openTheme(page, theme, {}, true);
    await expect.poll(() => page.evaluate(() => !!window.__widgetRoots
      .get(document.querySelector('punku-chat')!)!.querySelector('.markdown-body > p.cl-link-only > a'))).toBe(true);
    // A typed question enables the send button, and the field shows its focus.
    await page.keyboard.type('Is the museum open on Monday?');
    await expect.poll(() => lowContrast(page)).toEqual([]);

    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => !!window.__widgetRoots
      .get(document.querySelector('punku-chat')!)!.querySelector('.cl-retry-btn'))).toBe(true);
    await expect.poll(() => lowContrast(page)).toEqual([]);
  });

  test(`the ${theme} theme reads at WCAG AA: the welcome message, the suggestions and the placeholder`, async ({ page }) => {
    await openTheme(page, theme, { suggestions: JSON.stringify(['Opening hours', 'Tickets for families']) });
    await expect.poll(() => page.evaluate(() => window.__widgetRoots
      .get(document.querySelector('punku-chat')!)!.querySelectorAll('.cl-suggestion').length)).toBe(2);
    await expect.poll(() => lowContrast(page)).toEqual([]);
  });
}
