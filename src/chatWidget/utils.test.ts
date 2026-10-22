import {
  getChatPosition,
  getAnimationOrigin,
  extractMessageFromOutput,
  detectBrowserLanguage,
  revealInScrollContainer,
  trackVisualViewport,
  VISUAL_VIEWPORT_PROPERTIES,
} from './utils';

describe('getChatPosition', () => {
  const mockTriggerPosition: DOMRect = {
    top: 100,
    left: 200,
    width: 50,
    height: 50,
    bottom: 150,
    right: 250,
    x: 200,
    y: 100,
    toJSON: () => ({})
  };

  const Cwidth = 300;
  const Cheight = 400;

  it('should return default position when triggerPosition is null', () => {
    const result = getChatPosition(null as unknown as DOMRect, Cwidth, Cheight, 'top-left');
    expect(result).toEqual({ top: '0px', left: '0px' });
  });

  it('should return fixed bottom-right when no position is provided', () => {
    const result = getChatPosition(mockTriggerPosition, Cwidth, Cheight);
    expect(result).toEqual({
      top: 'auto',
      left: 'auto',
      position: 'bottom-right',
      bottom: '20px',
      right: '20px'
    });
  });

  it('should return correct position for top-left', () => {
    const result = getChatPosition(mockTriggerPosition, Cwidth, Cheight, 'top-left');
    expect(result.top).toBe(`${-5 - Cheight}px`);
    expect(result.left).toBe(`${-Cwidth}px`);
  });

  it('should return correct position for top-center', () => {
    const result = getChatPosition(mockTriggerPosition, Cwidth, Cheight, 'top-center');
    expect(result.top).toBe(`${-5 - Cheight}px`);
    expect(result.left).toBe(`${mockTriggerPosition.width / 2 - Cwidth / 2}px`);
  });

  it('should return correct position for top-right', () => {
    const result = getChatPosition(mockTriggerPosition, Cwidth, Cheight, 'top-right');
    expect(result.top).toBe(`${-5 - Cheight}px`);
    expect(result.left).toBe(`${mockTriggerPosition.width}px`);
  });

  it('should return correct position for center-left', () => {
    const result = getChatPosition(mockTriggerPosition, Cwidth, Cheight, 'center-left');
    expect(result.top).toBe(`${mockTriggerPosition.width / 2 - Cheight / 2}px`);
    expect(result.left).toBe(`${-Cwidth - 5}px`);
  });

  it('should return correct position for center-right', () => {
    const result = getChatPosition(mockTriggerPosition, Cwidth, Cheight, 'center-right');
    expect(result.top).toBe(`${mockTriggerPosition.width / 2 - Cheight / 2}px`);
    expect(result.left).toBe(`${mockTriggerPosition.width + 5}px`);
  });

  it('should return correct position for bottom-right', () => {
    const result = getChatPosition(mockTriggerPosition, Cwidth, Cheight, 'bottom-right');
    expect(result.top).toBe(`${-Cheight - 5}px`);
    expect(result.left).toBe(`${-Cwidth - 5}px`);
  });

  it('should return correct position for bottom-center', () => {
    const result = getChatPosition(mockTriggerPosition, Cwidth, Cheight, 'bottom-center');
    expect(result.top).toBe(`${5 + mockTriggerPosition.height}px`);
    expect(result.left).toBe(`${mockTriggerPosition.width / 2 - Cwidth / 2}px`);
  });

  it('should return correct position for bottom-left', () => {
    const result = getChatPosition(mockTriggerPosition, Cwidth, Cheight, 'bottom-left');
    expect(result.top).toBe(`${5 + mockTriggerPosition.height}px`);
    expect(result.left).toBe(`${-Cwidth}px`);
  });

  it('should return default position for unknown position value', () => {
    const result = getChatPosition(mockTriggerPosition, Cwidth, Cheight, 'unknown');
    expect(result.top).toBe(`${5 + mockTriggerPosition.height}px`);
    expect(result.left).toBe(`${mockTriggerPosition.width}px`);
  });
});

describe('getAnimationOrigin', () => {
  it('should return origin-bottom-right when no position is provided', () => {
    expect(getAnimationOrigin()).toBe('origin-bottom-right');
  });

  it('should return origin-bottom-right for top-left', () => {
    expect(getAnimationOrigin('top-left')).toBe('origin-bottom-right');
  });

  it('should return origin-bottom for top-center', () => {
    expect(getAnimationOrigin('top-center')).toBe('origin-bottom');
  });

  it('should return origin-bottom-left for top-right', () => {
    expect(getAnimationOrigin('top-right')).toBe('origin-bottom-left');
  });

  it('should return origin-center for center-left', () => {
    expect(getAnimationOrigin('center-left')).toBe('origin-center');
  });

  it('should return origin-center for center-right', () => {
    expect(getAnimationOrigin('center-right')).toBe('origin-center');
  });

  it('should return origin-top-left for bottom-right', () => {
    expect(getAnimationOrigin('bottom-right')).toBe('origin-top-left');
  });

  it('should return origin-top for bottom-center', () => {
    expect(getAnimationOrigin('bottom-center')).toBe('origin-top');
  });

  it('should return origin-top-right for bottom-left', () => {
    expect(getAnimationOrigin('bottom-left')).toBe('origin-top-right');
  });

  it('should return origin-top-left for unknown position', () => {
    expect(getAnimationOrigin('unknown')).toBe('origin-top-left');
  });
});

describe('extractMessageFromOutput', () => {
  it('should return message directly for type "text"', () => {
    const output = { type: 'text', message: 'Hello world' };
    expect(extractMessageFromOutput(output)).toBe('Hello world');
  });

  it('should return message.text for type "message"', () => {
    const output = { type: 'message', message: { text: 'Hello from message' } };
    expect(extractMessageFromOutput(output)).toBe('Hello from message');
  });

  it('should return message.text for type "object"', () => {
    const output = { type: 'object', message: { text: 'Hello from object' } };
    expect(extractMessageFromOutput(output)).toBe('Hello from object');
  });

  it('should return "Unknown message structure" for unknown type', () => {
    const output = { type: 'unknown', message: 'some message' };
    expect(extractMessageFromOutput(output)).toBe('Unknown message structure');
  });
});

describe('detectBrowserLanguage', () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    // Reset navigator mock before each test
  });

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true
    });
  });

  it('should return "en" when browser language is "en-US"', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['en-US'], language: 'en-US' },
      configurable: true
    });
    expect(detectBrowserLanguage(['en', 'de'])).toBe('en');
  });

  it('should return "de" when browser language is "de-DE"', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['de-DE'], language: 'de-DE' },
      configurable: true
    });
    expect(detectBrowserLanguage(['en', 'de'])).toBe('de');
  });

  it('should return "en" as default when no supported language is found', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['fr-FR', 'es-ES'], language: 'fr-FR' },
      configurable: true
    });
    expect(detectBrowserLanguage(['en', 'de'])).toBe('en');
  });

  it('should use navigator.language when navigator.languages is not available', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: null, language: 'de' },
      configurable: true
    });
    expect(detectBrowserLanguage(['en', 'de'])).toBe('de');
  });

  it('should prioritize first matching language in browser preferences', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['de-DE', 'en-US'], language: 'de-DE' },
      configurable: true
    });
    expect(detectBrowserLanguage(['en', 'de'])).toBe('de');
  });

  it('should use default available languages when none provided', () => {
    Object.defineProperty(global, 'navigator', {
      value: { languages: ['en-US'], language: 'en-US' },
      configurable: true
    });
    expect(detectBrowserLanguage()).toBe('en');
  });
});

describe('revealInScrollContainer', () => {
  // jsdom has no layout. Each test sets the list geometry: its client area
  // starts at y = 100, is 200 px tall, and its content is 2000 px tall.
  const box = (top: number, bottom: number) => ({ top, bottom } as DOMRect);

  function setup(listStyle = 'overflow-y: auto') {
    const list = document.createElement('div');
    list.setAttribute('style', listStyle);
    const message = document.createElement('div');
    const link = document.createElement('a');
    message.appendChild(link);
    list.appendChild(message);
    document.body.appendChild(list);
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 200 });
    list.getBoundingClientRect = () => box(100, 300);
    list.scrollTop = 500;
    const place = (top: number, bottom: number) => {
      link.getBoundingClientRect = () => box(top, bottom);
    };
    return { list, link, place };
  }

  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.scrollTop = 0;
  });

  it('scrolls the list up to an element above its visible area', () => {
    const { list, link, place } = setup();
    place(40, 60);
    revealInScrollContainer(link);
    expect(list.scrollTop).toBe(440);
  });

  it('scrolls the list down to an element below its visible area', () => {
    const { list, link, place } = setup();
    place(350, 370);
    revealInScrollContainer(link);
    expect(list.scrollTop).toBe(570);
  });

  it('shows the top of an element that is taller than the list', () => {
    const { list, link, place } = setup();
    place(250, 600);
    revealInScrollContainer(link);
    expect(list.scrollTop).toBe(650);
  });

  it('leaves a visible element in place', () => {
    const { list, link, place } = setup();
    place(150, 170);
    revealInScrollContainer(link);
    expect(list.scrollTop).toBe(500);
  });

  it('never scrolls the page when no ancestor scrolls', () => {
    const { list, link, place } = setup('overflow: visible');
    place(2000, 2020);
    revealInScrollContainer(link);
    expect(list.scrollTop).toBe(500);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
  });
});

describe('trackVisualViewport', () => {
  // jsdom has no visual viewport. Each test installs a fake one: a 412 x 839
  // phone screen at the top-left corner of a larger layout viewport.
  class FakeVisualViewport extends EventTarget {
    offsetLeft = 0;
    offsetTop = 0;
    width = 412;
    height = 839;
    scale = 1;
  }

  const jsdomVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
  let viewport: FakeVisualViewport;
  let frames: Map<number, FrameRequestCallback>;
  const runFrames = () => {
    const callbacks = Array.from(frames.values());
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  };
  const variables = (element: HTMLElement) =>
    Object.values(VISUAL_VIEWPORT_PROPERTIES).map((property) => element.style.getPropertyValue(property));

  beforeEach(() => {
    viewport = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    frames = new Map();
    let nextFrame = 1;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => {
      frames.delete(frame);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (jsdomVisualViewport) Object.defineProperty(window, 'visualViewport', jsdomVisualViewport);
    else delete (window as { visualViewport?: unknown }).visualViewport;
  });

  it('sets the visible box at once', () => {
    const element = document.createElement('div');
    viewport.offsetLeft = 43;
    viewport.offsetTop = 88;

    trackVisualViewport(element);

    expect(variables(element)).toEqual(['43px', '88px', '412px', '839px']);
  });

  it('follows a pan and the on-screen keyboard in the next frame', () => {
    const element = document.createElement('div');
    trackVisualViewport(element);

    viewport.offsetLeft = 43;
    viewport.dispatchEvent(new Event('scroll'));
    viewport.height = 500;
    viewport.dispatchEvent(new Event('resize'));
    // Both events share one frame.
    expect(frames.size).toBe(1);
    expect(variables(element)).toEqual(['0px', '0px', '412px', '839px']);

    runFrames();

    expect(variables(element)).toEqual(['43px', '0px', '412px', '500px']);
  });

  it('removes the box while the visitor pinch-zooms in, and sets it again at scale 1', () => {
    const element = document.createElement('div');
    trackVisualViewport(element);

    Object.assign(viewport, { scale: 2, offsetLeft: 50, offsetTop: 150, width: 206, height: 419.5 });
    viewport.dispatchEvent(new Event('resize'));
    runFrames();
    expect(variables(element)).toEqual(['', '', '', '']);

    Object.assign(viewport, { scale: 1, offsetLeft: 0, offsetTop: 0, width: 412, height: 839 });
    viewport.dispatchEvent(new Event('resize'));
    runFrames();
    expect(variables(element)).toEqual(['0px', '0px', '412px', '839px']);
  });

  it('stops after cleanup and cancels a pending frame', () => {
    const element = document.createElement('div');
    const stop = trackVisualViewport(element);
    viewport.width = 300;
    viewport.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(1);

    stop();
    expect(frames.size).toBe(0);
    viewport.dispatchEvent(new Event('scroll'));
    runFrames();

    // The last box stays, so a closing window does not jump.
    expect(variables(element)).toEqual(['0px', '0px', '412px', '839px']);
  });

  it('does nothing without a visual viewport', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
    const element = document.createElement('div');

    const stop = trackVisualViewport(element);

    expect(variables(element)).toEqual(['', '', '', '']);
    expect(() => stop()).not.toThrow();
  });
});
