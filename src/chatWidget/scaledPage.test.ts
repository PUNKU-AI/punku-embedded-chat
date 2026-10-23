import { act, renderHook } from '@testing-library/react';
import {
  getScaledFrameStyle,
  readScaledPage,
  SCALED_FRAME_PROPERTIES,
  screenRules,
  trackScaledFrame,
  useScaledPage,
  viewportLength,
} from './scaledPage';

// jsdom has no layout and no visual viewport. Each test installs a phone in
// landscape (740 x 360 screen px) that shows a page with width=320: the
// layout viewport is 320 x 156 CSS px at a page scale of 2.3125.
class FakeVisualViewport extends EventTarget {
  offsetLeft = 0;
  offsetTop = 0;
  width = 320;
  height = 156;
  scale = 2.3125;
}

const jsdomVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
let viewport: FakeVisualViewport;
const root = document.documentElement as unknown as { clientWidth?: number; clientHeight?: number; scrollWidth?: number };
const setLayoutViewport = (width: number, height: number) => {
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: height });
};
const setPageWidth = (width: number) =>
  Object.defineProperty(root, 'scrollWidth', { configurable: true, value: width });
const frameVariables = (element: HTMLElement) =>
  Object.values(SCALED_FRAME_PROPERTIES).map((property) => element.style.getPropertyValue(property));

beforeEach(() => {
  viewport = new FakeVisualViewport();
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  setLayoutViewport(320, 156);
  setPageWidth(320);
});

afterEach(() => {
  delete root.clientWidth;
  delete root.clientHeight;
  delete root.scrollWidth;
  if (jsdomVisualViewport) Object.defineProperty(window, 'visualViewport', jsdomVisualViewport);
  else delete (window as { visualViewport?: unknown }).visualViewport;
});

describe('readScaledPage', () => {
  it('gives the page scale and the layout viewport in screen px', () => {
    expect(readScaledPage()).toEqual({ scale: 2.3125, width: 740, height: 361 });
  });

  it('measures the page scale without pinch zoom', () => {
    // The visitor zooms in to twice the page scale: half the width is visible.
    Object.assign(viewport, { scale: 4.625, width: 160, height: 78 });
    expect(readScaledPage()).toEqual({ scale: 2.3125, width: 740, height: 361 });
  });

  it('gives null on a page with width=device-width', () => {
    setLayoutViewport(740, 360);
    Object.assign(viewport, { scale: 1, width: 740, height: 360 });
    expect(readScaledPage()).toBeNull();

    // Pinch zoom alone does not scale the page.
    Object.assign(viewport, { scale: 2, width: 370, height: 180 });
    expect(readScaledPage()).toBeNull();
  });

  it('gives null below the minimum page scale and without a visual viewport', () => {
    // width=375 on a 390 px phone: the widget is only 4 % larger.
    setLayoutViewport(375, 811);
    Object.assign(viewport, { scale: 1.04, width: 375, height: 811 });
    expect(readScaledPage()).toBeNull();

    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
    expect(readScaledPage()).toBeNull();
  });
});

describe('useScaledPage', () => {
  it('follows a rotation, and ignores the on-screen keyboard', () => {
    const { result } = renderHook(() => useScaledPage(true));
    const landscape = result.current;
    expect(landscape).toEqual({ scale: 2.3125, width: 740, height: 361 });

    // The keyboard makes only the visual viewport shorter.
    viewport.height = 70;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(landscape);

    // Portrait 360 x 740: the page is 320 x 658 CSS px.
    setLayoutViewport(320, 658);
    Object.assign(viewport, { scale: 1.125, width: 320, height: 658 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toEqual({ scale: 1.125, width: 360, height: 740 });
  });

  it('gives null while it is disabled', () => {
    const { result } = renderHook(() => useScaledPage(false));
    expect(result.current).toBeNull();
  });
});

describe('trackScaledFrame', () => {
  const stops: Array<() => void> = [];
  const track = (open: boolean) => {
    const frame = document.createElement('div');
    stops.push(trackScaledFrame(frame, 2.3125, open));
    return frame;
  };

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
  });

  it('covers the visible part of the page in frame px while the window is open', () => {
    const frame = track(true);
    expect(frameVariables(frame)).toEqual(['0px', '0px', '740px', '360.75px']);

    // The on-screen keyboard and a pan of the visible area.
    Object.assign(viewport, { offsetTop: 40, height: 80 });
    viewport.dispatchEvent(new Event('scroll'));
    expect(frameVariables(frame)).toEqual(['0px', '40px', '740px', '185px']);
  });

  it('keeps the closed frame on the layout viewport, so the trigger stays behind the keyboard', () => {
    const frame = track(false);
    viewport.height = 80;
    viewport.dispatchEvent(new Event('resize'));
    expect(frameVariables(frame)).toEqual(['0px', '0px', '740px', '360.75px']);
  });

  it('follows the visible part of a page wider than the screen also while closed', () => {
    setPageWidth(400);
    const frame = track(false);
    Object.assign(viewport, { offsetLeft: 80, height: 80 });
    viewport.dispatchEvent(new Event('scroll'));
    expect(frameVariables(frame)).toEqual(['80px', '0px', '740px', '185px']);
  });

  it('covers the layout viewport while the visitor pinch-zooms in', () => {
    const frame = track(true);
    Object.assign(viewport, { scale: 4.625, offsetLeft: 100, offsetTop: 30, width: 160, height: 78 });
    viewport.dispatchEvent(new Event('resize'));
    expect(frameVariables(frame)).toEqual(['0px', '0px', '740px', '360.75px']);
  });

  it('removes the variables when it stops', () => {
    const frame = track(true);
    stops.pop()!();
    expect(frameVariables(frame)).toEqual(['', '', '', '']);
  });
});

describe('getScaledFrameStyle', () => {
  it('undoes the page scale and lets taps through to the host page', () => {
    expect(getScaledFrameStyle({ scale: 2.5, width: 800, height: 400 })).toMatchObject({
      position: 'fixed',
      left: 'var(--cl-frame-left, 0px)',
      top: 'var(--cl-frame-top, 0px)',
      width: 'var(--cl-frame-width, 800px)',
      height: 'var(--cl-frame-height, 400px)',
      transform: 'scale(0.4)',
      transformOrigin: '0 0',
      pointerEvents: 'none',
    });
  });
});

describe('screenRules', () => {
  const page = { scale: 2.3125, width: 740, height: 361 };

  it('wraps the rules in an @media rule on other pages', () => {
    expect(screenRules({ maxWidth: 640 }, ' a {} ', null)).toBe('@media (max-width: 640px) { a {} }');
    expect(screenRules({ minWidth: 641, maxWidth: 1023, maxHeight: 500 }, 'b', null))
      .toBe('@media (min-width: 641px) and (max-width: 1023px) and (max-height: 500px) {b}');
  });

  it('gives the rules that match the frame size on a scaled page', () => {
    expect(screenRules({ maxWidth: 640 }, 'phone', page)).toBe('');
    expect(screenRules({ minWidth: 641 }, 'wide', page)).toBe('wide');
    expect(screenRules({ minWidth: 641, maxWidth: 767 }, 'landscape', page)).toBe('landscape');
    expect(screenRules({ minWidth: 641, maxWidth: 1023, maxHeight: 500 }, 'short', page)).toBe('short');
    expect(screenRules({ minWidth: 768, maxWidth: 1023 }, 'tablet', page)).toBe('');
    expect(screenRules({ maxWidth: 640 }, 'phone', { scale: 1.22, width: 390, height: 844 })).toBe('phone');
  });
});

describe('viewportLength', () => {
  it('keeps viewport units on other pages, and uses frame px on a scaled page', () => {
    expect(viewportLength(70, 'vh', null)).toBe('70vh');
    expect(viewportLength(85, 'vw', null)).toBe('85vw');
    expect(viewportLength(70, 'vh', { scale: 2.3125, width: 740, height: 361 })).toBe('252.7px');
    expect(viewportLength(85, 'vw', { scale: 2.3125, width: 740, height: 361 })).toBe('629px');
  });
});
