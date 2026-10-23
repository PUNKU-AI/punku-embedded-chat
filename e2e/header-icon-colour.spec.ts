import { expect, Page, test } from '@playwright/test';
import { loadWidget } from './widget-helpers';

// Issue #70: live embeds use theme="default", a light button_text_color and no
// button_color. The header stays white, so white header icons were invisible.
// On a phone the close X is the only close control.
const props = {
  theme: 'default',
  button_text_color: '#FFFFFF',
  start_open: 'true',
  show_closed_widget_hint: 'false',
};

const icons = ['.cl-header-logo', '.cl-new-session-btn svg', '.cl-close-btn svg'];

type Rgb = [number, number, number];
// backdrop: the colour behind the icon. The header icon sits on its avatar.
type Icon = { stroke: string; visible: boolean; backdrop: string };
type Header = { background: string; icons: Record<string, Icon | null> };

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', (error) => pageErrors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function headerColours(page: Page): Promise<Header | null> {
  return page.evaluate((selectors) => {
    const host = document.querySelector('punku-chat');
    const root = host && window.__widgetRoots.get(host);
    const header = root?.querySelector<HTMLElement>('.cl-header');
    if (!root || !header) return null;
    const result: Record<string, Icon | null> = {};
    for (const selector of selectors) {
      const icon = root.querySelector<SVGElement>(selector);
      if (!icon) {
        result[selector] = null;
        continue;
      }
      const rect = icon.getBoundingClientRect();
      const style = getComputedStyle(icon);
      const avatar = icon.closest('.cl-header-avatar');
      result[selector] = {
        stroke: style.stroke,
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility === 'visible',
        backdrop: getComputedStyle(avatar || header).backgroundColor,
      };
    }
    return { background: getComputedStyle(header).backgroundColor, icons: result };
  }, icons);
}

function rgb(value: string): Rgb {
  const channels = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  expect(channels, `"${value}" is an rgb() colour`).toHaveLength(3);
  return channels as Rgb;
}

// WCAG 2.1 relative luminance and contrast ratio.
function contrast(first: Rgb, second: Rgb) {
  const luminance = (colour: Rgb) => {
    const [r, g, b] = colour.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

async function expectVisibleHeaderIcons(page: Page, extraProps: Record<string, string> = {}) {
  await loadWidget(page, { ...props, ...extraProps });
  await expect.poll(async () => {
    const header = await headerColours(page);
    return !!header && icons.every((selector) => header.icons[selector]?.visible);
  }, { message: 'The header icon, new-chat and close icons must render.' }).toBe(true);

  const header = (await headerColours(page))!;
  expect(header.background).toBe('rgb(255, 255, 255)');
  // The header icon is blue on its light circle; the actions are dark on the white header.
  const expected: Record<string, { stroke: string; backdrop: string }> = {
    // The default blue #0969da on its light circle (#0969da at 12% on white).
    '.cl-header-logo': { stroke: 'rgb(9, 105, 218)', backdrop: 'rgb(225, 237, 251)' },
    '.cl-new-session-btn svg': { stroke: 'rgb(15, 23, 42)', backdrop: header.background },
    '.cl-close-btn svg': { stroke: 'rgb(15, 23, 42)', backdrop: header.background },
  };
  for (const selector of icons) {
    const icon = header.icons[selector]!;
    expect({ stroke: icon.stroke, backdrop: icon.backdrop }, selector).toEqual(expected[selector]);
    // WCAG 1.4.11 asks for 3:1 against the adjacent colour for UI components.
    expect(contrast(rgb(icon.stroke), rgb(icon.backdrop)), selector).toBeGreaterThanOrEqual(3);
  }
}

test.describe('desktop 1366x768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('header icons are visible with a light button_text_color and no button_color', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The desktop layout runs on the three desktop engines.');
    // Desktop hides the close X unless the embed asks for it.
    await expectVisibleHeaderIcons(page, { show_close_button_on_desktop: 'true' });
  });
});

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('header icons, including the only close control, are visible', async ({ page }) => {
    // The phone layout always shows the close X, as on the live embeds.
    await expectVisibleHeaderIcons(page);
  });
});
