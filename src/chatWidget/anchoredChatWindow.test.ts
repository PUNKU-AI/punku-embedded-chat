import {
  getAnchoredChatWindowPlacement,
  getChatWindowSize,
  getViewportSize,
  isTabletLayout,
  isTriggerOnLeftSide,
  ViewportSize,
} from './anchoredChatWindow';

// The placement before the tablet fix. Desktop and phone layouts keep it.
const previousPlacement = (trigger: { x: number; y: number }, viewport: ViewportSize, width = 450, height = 650) => {
  const renderedWidth = Math.min(width, viewport.width - 32, viewport.width * 0.9);
  const renderedHeight = Math.min(height, viewport.height - 32, viewport.height * 0.7);
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
  const openAbove = trigger.y + 24 >= viewport.height / 2;
  const alignLeft = trigger.x + 24 < viewport.width / 2;
  const top = openAbove ? trigger.y - 32 - renderedHeight : trigger.y + 48 + 32;
  const left = alignLeft ? trigger.x : trigger.x + 48 - renderedWidth;
  return {
    top: Math.round(clamp(top, 16, viewport.height - renderedHeight - 16)),
    left: Math.round(clamp(left, 16, viewport.width - renderedWidth - 16)),
  };
};

// Triggers 24 px from each corner of the screen.
const quadrantTriggers = ({ width, height }: ViewportSize, size = 48) => ({
  'top-left': { x: 24, y: 24, width: size, height: size },
  'top-right': { x: width - 24 - size, y: 24, width: size, height: size },
  'bottom-left': { x: 24, y: height - 24 - size, width: size, height: size },
  'bottom-right': { x: width - 24 - size, y: height - 24 - size, width: size, height: size },
});

const gapBetween = (
  window: { top: number; left: number; width: number; height: number },
  trigger: { x: number; y: number; width: number; height: number }
) => {
  const horizontal = Math.max(trigger.x - (window.left + window.width), window.left - (trigger.x + trigger.width), 0);
  const vertical = Math.max(trigger.y - (window.top + window.height), window.top - (trigger.y + trigger.height), 0);
  return Math.max(horizontal, vertical);
};

describe('isTabletLayout', () => {
  it.each([
    [640, false],
    [641, true],
    [767, true],
    [768, true],
    [1023, true],
    [1024, false],
  ])('should treat a %p px wide screen as tablet: %p', (width, expected) => {
    expect(isTabletLayout({ width, height: 800 })).toBe(expected);
  });

  it('should follow the media query result over the width', () => {
    // A classic scrollbar: the media queries see 1030 px, the layout viewport 1015 px.
    expect(isTabletLayout({ width: 1015, height: 800, tabletLayout: null })).toBe(false);
    expect(isTabletLayout({ width: 1030, height: 800, tabletLayout: 'large' })).toBe(true);
  });
});

describe('getViewportSize', () => {
  const root = document.documentElement;

  afterEach(() => {
    delete (root as any).clientWidth;
    delete (root as any).clientHeight;
    delete (window as any).matchMedia;
  });

  it('should read the layout viewport and the media queries of the window CSS', () => {
    // WebKit: pinch zoom makes innerWidth and innerHeight the visual viewport.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 405 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 540 });
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 810 });
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 1080 });
    window.matchMedia = ((query: string) => ({ matches: query.includes('768px') })) as typeof window.matchMedia;

    expect(getViewportSize()).toEqual({ width: 810, height: 1080, tabletLayout: 'large' });
  });

  it('should use innerWidth and innerHeight without a layout (jsdom)', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 750 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 342 });

    expect(getViewportSize()).toEqual({ width: 750, height: 342 });
  });
});

describe('getChatWindowSize', () => {
  it('should use the small tablet CSS size from 641 to 767 px and ignore the props', () => {
    expect(getChatWindowSize({ width: 750, height: 342 }, 300, 230)).toEqual({ width: 420, height: 256 });
    expect(getChatWindowSize({ width: 700, height: 1000 }, 300, 230)).toEqual({ width: 420, height: 600 });
  });

  it('should size the window from the media query result', () => {
    expect(getChatWindowSize({ width: 1030, height: 800, tabletLayout: 'large' }, 300, 230)).toEqual({ width: 420, height: 560 });
    expect(getChatWindowSize({ width: 1000, height: 800, tabletLayout: null }, 300, 230)).toEqual({ width: 300, height: 230 });
  });

  it('should use the tablet CSS size from 768 to 1023 px and ignore the props', () => {
    expect(getChatWindowSize({ width: 810, height: 1080 }, 300, 230)).toEqual({ width: 420, height: 600 });
    expect(getChatWindowSize({ width: 1000, height: 600 }, 300, 230)).toEqual({ width: 420, height: 420 });
  });

  it('should keep a tablet window inside the screen margins', () => {
    expect(getChatWindowSize({ width: 700, height: 40 })).toEqual({ width: 420, height: 8 });
  });

  it.each([
    [{ width: 1280, height: 720 }, 300, 230, { width: 300, height: 230 }],
    [{ width: 1280, height: 720 }, undefined, undefined, { width: 450, height: 504 }],
    [{ width: 390, height: 844 }, undefined, undefined, { width: 351, height: 590.8 }],
  ])('should size the window at %p from the props %p x %p', (viewport, width, height, expected) => {
    const size = getChatWindowSize(viewport, width, height);
    expect(size.width).toBeCloseTo(expected.width);
    expect(size.height).toBeCloseTo(expected.height);
  });
});

describe('getAnchoredChatWindowPlacement', () => {
  it.each([
    { width: 390, height: 844 },
    { width: 640, height: 900 },
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ])('should keep the previous placement on a %p screen', (viewport) => {
    for (let x = -20; x <= viewport.width; x += 37) {
      for (let y = -20; y <= viewport.height; y += 41) {
        for (const [width, height] of [[450, 650], [300, 230]]) {
          const { top, left } = getAnchoredChatWindowPlacement({ x, y }, viewport, width, height);
          expect({ x, y, width, height, top, left })
            .toEqual({ x, y, width, height, ...previousPlacement({ x, y }, viewport, width, height) });
        }
      }
    }
  });

  it('should open the tablet window above or below the trigger', () => {
    const viewport = { width: 810, height: 1080 };
    const triggers = quadrantTriggers(viewport);
    const place = (trigger: { x: number; y: number }) => getAnchoredChatWindowPlacement(trigger, viewport, 300, 230);

    expect(place(triggers['top-left'])).toEqual({ top: 104, left: 24, width: 420, height: 600 });
    expect(place(triggers['top-right'])).toEqual({ top: 104, left: 366, width: 420, height: 600 });
    expect(place(triggers['bottom-left'])).toEqual({ top: 376, left: 24, width: 420, height: 600 });
    expect(place(triggers['bottom-right'])).toEqual({ top: 376, left: 366, width: 420, height: 600 });
    // The trigger from the issue report.
    expect(place({ x: 730, y: 1000 })).toEqual({ top: 368, left: 358, width: 420, height: 600 });
  });

  it('should open the window beside the trigger when a short screen has no room above or below', () => {
    const viewport = { width: 750, height: 342 };

    // Right of a left-side trigger, top-aligned with it, then held 16 px above the bottom.
    expect(getAnchoredChatWindowPlacement({ x: 24, y: 120 }, viewport, 300, 230))
      .toEqual({ top: 70, left: 84, width: 420, height: 256 });
    // Left of a right-side trigger, bottom-aligned with it.
    expect(getAnchoredChatWindowPlacement({ x: 670, y: 262 }, viewport, 300, 230))
      .toEqual({ top: 54, left: 238, width: 420, height: 256 });
  });

  it('should hold the window on the screen when it fits neither beside nor above or below the trigger', () => {
    const viewport = { width: 700, height: 342 };

    expect(getAnchoredChatWindowPlacement({ x: 300, y: 120 }, viewport))
      .toEqual({ top: 70, left: 264, width: 420, height: 256 });
  });

  it.each([
    { width: 641, height: 360 },
    { width: 750, height: 342 },
    { width: 767, height: 1024 },
    { width: 768, height: 1024 },
    { width: 810, height: 1080 },
    { width: 1023, height: 500 },
  ])('should keep the tablet window on a %p screen and next to the trigger in every quadrant', (viewport) => {
    const triggers = [48, 72].flatMap((size) =>
      Object.entries(quadrantTriggers(viewport, size)).map(([quadrant, trigger]) => [`${size} px ${quadrant}`, trigger] as const)
    );
    const problems = triggers.flatMap(([quadrant, trigger]) => {
      const placement = getAnchoredChatWindowPlacement(trigger, viewport, 300, 230);
      const right = placement.left + placement.width;
      const bottom = placement.top + placement.height;
      const onScreen = placement.top >= 16 && placement.left >= 16 &&
        right <= viewport.width - 16 && bottom <= viewport.height - 16;
      // A gap of 0 means that the window covers part of the trigger.
      const gap = gapBetween(placement, trigger);
      return [
        ...(onScreen ? [] : [`${quadrant}: window x ${placement.left}-${right}, y ${placement.top}-${bottom}`]),
        ...(gap >= 12 && gap <= 32 ? [] : [`${quadrant}: ${gap} px between window and trigger`]),
      ];
    });

    expect(problems).toEqual([]);
  });

  it('should keep the gaps to a trigger larger than 48 px', () => {
    const tablet = { width: 810, height: 1080 };
    const landscape = { width: 750, height: 342 };

    // 32 px below the trigger bottom, right edges aligned.
    expect(getAnchoredChatWindowPlacement({ x: 714, y: 24, width: 72, height: 72 }, tablet))
      .toEqual({ top: 128, left: 366, width: 420, height: 600 });
    // 32 px above the trigger top.
    expect(getAnchoredChatWindowPlacement({ x: 24, y: 984, width: 72, height: 72 }, tablet))
      .toEqual({ top: 352, left: 24, width: 420, height: 600 });
    // 12 px right of the trigger.
    expect(getAnchoredChatWindowPlacement({ x: 24, y: 120, width: 72, height: 72 }, landscape))
      .toEqual({ top: 70, left: 108, width: 420, height: 256 });
    // On desktop too: the window starts 32 px below a 72 px trigger.
    expect(getAnchoredChatWindowPlacement({ x: 24, y: 24, width: 72, height: 72 }, { width: 1280, height: 720 }, 300, 230))
      .toEqual({ top: 128, left: 24, width: 300, height: 230 });
  });
});

describe('isTriggerOnLeftSide', () => {
  it('should use the center of the rendered trigger', () => {
    const viewport = { width: 800, height: 600 };

    expect(isTriggerOnLeftSide({ x: 360, y: 0 }, viewport)).toBe(true);
    expect(isTriggerOnLeftSide({ x: 360, y: 0, width: 96 }, viewport)).toBe(false);
  });
});
