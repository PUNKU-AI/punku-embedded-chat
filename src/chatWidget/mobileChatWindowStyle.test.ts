import { phoneWindowDeclarations, phoneWindowStyle, readMobileChatWindowStyle } from './mobileChatWindowStyle';
import { visualViewportInset } from './utils';

// The phone window box of v1.0.22, before mobile_chat_window_style. Pages
// without the prop must get exactly these declarations.
const PHONE_DEFAULTS = [
  'top: calc(var(--cl-visual-viewport-top, 0px) + var(--cl-top-offset, 0px)) !important;',
  'left: var(--cl-visual-viewport-left, 0px) !important;',
  'right: auto !important;',
  'bottom: auto !important;',
  'width: var(--cl-visual-viewport-width, 100%) !important;',
  'height: calc(var(--cl-visual-viewport-height, 100%) - 80px - var(--cl-top-offset, 0px)) !important;',
  'max-height: calc(var(--cl-visual-viewport-height, 100%) - 80px - var(--cl-top-offset, 0px)) !important;',
  'max-width: var(--cl-visual-viewport-width, 100%) !important;',
];

// The phone styles of a live embed (no flow ID, host or texts).
const LIVE_MOBILE_STYLE = { bottom: '65px', height: 'calc(98vh - 120px)' };
const VISIBLE_98VH = 'calc(98 * var(--cl-visual-viewport-height, 100vh) / 100)';

// The value that applies: the last declaration of each property.
const declarations = (style: Record<string, unknown>, scaledPage = null as Parameters<typeof phoneWindowDeclarations>[1]) =>
  Object.fromEntries(
    phoneWindowDeclarations(readMobileChatWindowStyle(style), scaledPage).map((line) => {
      const [property, ...value] = line.replace(/ !important;$/, '').split(': ');
      return [property, value.join(': ')];
    })
  );

describe('readMobileChatWindowStyle', () => {
  it('keeps the seven keys of the swarovski-widget branch and nothing else', () => {
    expect(readMobileChatWindowStyle({
      top: '10px', right: '11px', bottom: '12px', left: '13px', width: '300px', height: '400px', maxHeight: '500px',
      borderRadius: '16px', backgroundColor: 'red', zIndex: 5, minHeight: '100px',
    })).toEqual({
      top: '10px', right: '11px', bottom: '12px', left: '13px', width: '300px', height: '400px', maxHeight: '500px',
    });
  });

  it('reads numbers and plain number strings as px', () => {
    expect(readMobileChatWindowStyle({ bottom: 65, top: 0, left: '8', height: '0.5' }))
      .toEqual({ bottom: '65px', top: '0px', left: '8px', height: '0.5px' });
  });

  it('keeps CSS functions and drops a trailing !important', () => {
    expect(readMobileChatWindowStyle({
      height: 'calc(98vh - 120px)',
      bottom: 'calc(65px + env(safe-area-inset-bottom)) !important',
      maxHeight: 'min(600px, 80dvh)',
    })).toEqual({
      height: 'calc(98vh - 120px)',
      bottom: 'calc(65px + env(safe-area-inset-bottom))',
      maxHeight: 'min(600px, 80dvh)',
    });
  });

  it('ignores keywords, other types and values that could break the style sheet', () => {
    expect(readMobileChatWindowStyle({
      top: 'auto',
      bottom: 'inherit',
      left: '10px; color: red',
      right: '1px } .cl-window { display: none',
      width: '"300px"',
      height: Number.NaN,
      maxHeight: { value: '500px' },
    })).toEqual({});
  });

  it('accepts no prop, arrays and other non-objects', () => {
    expect(readMobileChatWindowStyle(undefined)).toEqual({});
    expect(readMobileChatWindowStyle(null)).toEqual({});
    expect(readMobileChatWindowStyle(['65px'])).toEqual({});
    expect(readMobileChatWindowStyle('{"bottom":"65px"}')).toEqual({});
  });

  describe('in a browser with CSS.supports', () => {
    let supports: jest.Mock<boolean, [string, string]>;
    beforeEach(() => {
      supports = jest.fn((property: string, value: string) => !/oops/.test(value) && property !== 'max-height');
      Object.defineProperty(window, 'CSS', { configurable: true, value: { supports } });
    });
    afterEach(() => {
      delete (window as { CSS?: unknown }).CSS;
    });

    it('asks the browser with the CSS property name', () => {
      expect(readMobileChatWindowStyle({ bottom: '65px', top: 'oops(1px)', maxHeight: '500px' })).toEqual({ bottom: '65px' });
      expect(supports).toHaveBeenCalledWith('bottom', '65px');
      expect(supports).toHaveBeenCalledWith('max-height', '500px');
    });
  });
});

describe('phoneWindowStyle', () => {
  // The branch box: 8 px from the left, calc(100vw - 16px) wide, at most 90vw.
  const branchBox = { left: '8px', width: 'min(calc(100vw - 16px), 90vw)' };

  it('gives the swarovski theme the side margins of the branch, under the live prop', () => {
    expect(phoneWindowStyle(LIVE_MOBILE_STYLE, 'swarovski')).toEqual({ ...branchBox, ...LIVE_MOBILE_STYLE });
    expect(phoneWindowStyle(undefined, 'swarovski')).toEqual(branchBox);
  });

  it('gives other themes only the prop', () => {
    for (const theme of [undefined, 'default', 'dark', 'ocean', 'aurora', 'punku-ai-bookingkit', 'constructor', 'toString']) {
      expect(phoneWindowStyle(LIVE_MOBILE_STYLE, theme)).toEqual(LIVE_MOBILE_STYLE);
      expect(phoneWindowStyle(undefined, theme)).toEqual({});
    }
  });

  it('lets a horizontal prop key replace all horizontal theme keys', () => {
    expect(phoneWindowStyle({ right: '12px' }, 'swarovski')).toEqual({ right: '12px' });
    expect(phoneWindowStyle({ width: '300px', bottom: '65px' }, 'swarovski')).toEqual({ width: '300px', bottom: '65px' });
  });

  it('measures 351 px from x 8 on a 390 px phone, as the branch', () => {
    const lines = phoneWindowDeclarations(phoneWindowStyle(LIVE_MOBILE_STYLE, 'swarovski'));
    const visibleWidth = 'var(--cl-visual-viewport-width, 100vw)';
    expect(lines).toContain(
      `width: round(min(calc(calc(100 * ${visibleWidth} / 100) - 16px), calc(90 * ${visibleWidth} / 100)), 1px) !important;`
    );
    expect(lines).toContain(`left: ${visualViewportInset('left', 'round(max(0px, 8px), 1px)')} !important;`);
  });
});

describe('phoneWindowDeclarations', () => {
  it('gives the v1.0.22 phone box without the prop', () => {
    expect(phoneWindowDeclarations({})).toEqual(PHONE_DEFAULTS);
    expect(phoneWindowDeclarations(readMobileChatWindowStyle({ borderRadius: '16px', top: 'auto' }))).toEqual(PHONE_DEFAULTS);
  });

  it('places the live embed 65 px above the visible bottom, 98 % of the visible height minus 120 px tall', () => {
    expect(declarations(LIVE_MOBILE_STYLE)).toEqual({
      top: 'auto',
      bottom: visualViewportInset('bottom', 'round(max(0px, 65px), 1px)'),
      height: `round(calc(${VISIBLE_98VH} - 120px), 1px)`,
      // maxHeight defaults to height, and the window cannot rise above the visible area.
      'max-height': `min(round(calc(${VISIBLE_98VH} - 120px), 1px), calc(var(--cl-visual-viewport-height, 100%) - round(max(0px, 65px), 1px)))`,
      // The width keeps the phone default: the visible width.
      left: 'var(--cl-visual-viewport-left, 0px)',
      right: 'auto',
      width: 'var(--cl-visual-viewport-width, 100%)',
      'max-width': 'var(--cl-visual-viewport-width, 100%)',
    });
  });

  it('keeps the top-left corner when top or left is set, also together with bottom or right', () => {
    const box = declarations({ top: '72px', bottom: '65px', left: '8px', right: '8px' });
    const gap = (length: string) => `round(max(0px, ${length}), 1px)`;
    expect(box.top).toBe(visualViewportInset('top', gap('72px')));
    expect(box.bottom).toBe('auto');
    expect(box.left).toBe(visualViewportInset('left', gap('8px')));
    expect(box.right).toBe('auto');
    // Without height and width, the window fills the room between the gaps.
    expect(box.height).toBe(`calc(var(--cl-visual-viewport-height, 100%) - ${gap('65px')} - ${gap('72px')})`);
    expect(box.width).toBe(`calc(var(--cl-visual-viewport-width, 100%) - ${gap('8px')} - ${gap('8px')})`);
    expect(box['max-width']).toBe(`calc(var(--cl-visual-viewport-width, 100%) - ${gap('8px')})`);
  });

  it('places the window from the right when only right is set', () => {
    const box = declarations({ right: '12px', width: '300px' });
    expect(box.left).toBe('auto');
    expect(box.right).toBe(visualViewportInset('right', 'round(max(0px, 12px), 1px)'));
    expect(box.width).toBe('round(300px, 1px)');
    expect(box['max-width']).toBe('calc(var(--cl-visual-viewport-width, 100%) - round(max(0px, 12px), 1px))');
  });

  it('fills down from top_offset to a bottom gap without height', () => {
    const box = declarations({ bottom: '20px' });
    expect(box.top).toBe('auto');
    expect(box.height).toBe('calc(var(--cl-visual-viewport-height, 100%) - round(max(0px, 20px), 1px) - var(--cl-top-offset, 0px))');
    expect(box['max-height']).toBe(box.height);
  });

  it('uses maxHeight over height, and keeps the window inside the visible area', () => {
    const box = declarations({ height: '700px', maxHeight: '60vh' });
    expect(box.top).toBe(visualViewportInset('top', 'var(--cl-top-offset, 0px)'));
    expect(box.height).toBe('round(700px, 1px)');
    expect(box['max-height']).toBe(
      'min(round(calc(60 * var(--cl-visual-viewport-height, 100vh) / 100), 1px), calc(var(--cl-visual-viewport-height, 100%) - var(--cl-top-offset, 0px)))'
    );
  });

  it('measures every viewport unit on the visible area, but not names or other units', () => {
    const box = declarations({ width: 'calc(100vw - 16px)', height: 'min(80dvh, 40svh + 5lvh, 50vmin)', top: 'calc(var(--space-2vh, 0px) + 1.5vh)' });
    expect(box.width).toBe('round(calc(calc(100 * var(--cl-visual-viewport-width, 100vw) / 100) - 16px), 1px)');
    expect(box.height).toBe(
      'round(min(calc(80 * var(--cl-visual-viewport-height, 100vh) / 100), ' +
      'calc(40 * var(--cl-visual-viewport-height, 100vh) / 100) + calc(5 * var(--cl-visual-viewport-height, 100vh) / 100), 50vmin), 1px)'
    );
    expect(box.top).toContain('var(--space-2vh, 0px) + calc(1.5 * var(--cl-visual-viewport-height, 100vh) / 100)');
  });

  it('rounds to whole px after a fallback for browsers without CSS round()', () => {
    const lines = phoneWindowDeclarations(readMobileChatWindowStyle(LIVE_MOBILE_STYLE));
    const heights = lines.filter((line) => line.startsWith('height: '));
    expect(heights).toEqual([
      `height: calc(${VISIBLE_98VH} - 120px) !important;`,
      `height: round(calc(${VISIBLE_98VH} - 120px), 1px) !important;`,
    ]);
    // Declarations without a prop length come once.
    expect(lines.filter((line) => line.startsWith('width: '))).toEqual(['width: var(--cl-visual-viewport-width, 100%) !important;']);
    // The plain box comes first, in the order of the defaults.
    expect(lines.slice(0, 8).map((line) => line.split(':')[0])).toEqual(
      ['top', 'left', 'right', 'bottom', 'width', 'height', 'max-height', 'max-width']
    );
  });

  it('keeps negative gaps at 0, so the header stays on the screen', () => {
    expect(declarations({ top: '-40px' }).top).toBe(visualViewportInset('top', 'round(max(0px, -40px), 1px)'));
  });

  describe('on a scaled page (#82)', () => {
    // width=320 on a 390 x 844 phone: the frame is the screen, in screen px.
    const portrait = { scale: 1.21875, width: 390, height: 843 };

    it('measures viewport units on the frame and scales the gaps like bottom_offset', () => {
      const box = declarations(LIVE_MOBILE_STYLE, portrait);
      expect(box.bottom).toBe(visualViewportInset('bottom', 'round(max(0px, 79.22px), 1px)'));
      // Sizes are the widget's own: px stay screen px.
      expect(box.height).toBe('round(calc(calc(98 * var(--cl-visual-viewport-height, 843px) / 100) - 120px), 1px)');
    });

    it('gives the v1.0.22 phone box without the prop', () => {
      expect(phoneWindowDeclarations({}, portrait)).toEqual(PHONE_DEFAULTS);
    });
  });
});
