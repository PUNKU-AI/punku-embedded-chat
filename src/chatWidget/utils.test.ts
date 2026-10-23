import {
  getChatPosition,
  getAnimationOrigin,
  extractMessageFromOutput,
  chooseLanguage,
  detectBrowserLanguage,
  detectPageLanguage,
  revealInScrollContainer,
  getPageScale,
  subscribeVisualViewport,
  trackVisualViewport,
  VISUAL_VIEWPORT_PROPERTIES,
  visualViewportInset,
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

// The language of the built-in texts when the snippet sets no default_language.
describe('detectPageLanguage and chooseLanguage', () => {
  const originalNavigator = global.navigator;
  const setBrowser = (...languages: string[]) => {
    Object.defineProperty(global, 'navigator', {
      value: { languages, language: languages[0] },
      configurable: true,
    });
  };

  afterEach(() => {
    document.documentElement.removeAttribute('lang');
    Object.defineProperty(global, 'navigator', { value: originalNavigator, configurable: true });
  });

  it('reads the page language from <html lang>', () => {
    document.documentElement.setAttribute('lang', 'it-IT');
    expect(detectPageLanguage()).toBe('it');
    document.documentElement.setAttribute('lang', 'nl');
    expect(detectPageLanguage()).toBeNull();
    document.documentElement.removeAttribute('lang');
    expect(detectPageLanguage()).toBeNull();
  });

  it.each([
    ['it-IT', 'it'],
    ['es', 'es'],
    ['pt-PT', 'pt'],
    ['fr', 'fr'],
    ['pl-PL', 'pl'],
    ['de', 'de'],
  ])('takes the page language %s over an English browser', (pageLang, language) => {
    setBrowser('en-US', 'en');
    document.documentElement.setAttribute('lang', pageLang);
    expect(chooseLanguage()).toBe(language);
  });

  it('takes the browser language on a page without a language the widget has', () => {
    setBrowser('pl-PL', 'en');
    document.documentElement.setAttribute('lang', 'nl');
    expect(chooseLanguage()).toBe('pl');
    document.documentElement.removeAttribute('lang');
    expect(chooseLanguage()).toBe('pl');
  });

  it('falls back to English when neither the page nor the browser language is known', () => {
    setBrowser('nl-NL', 'ja');
    document.documentElement.setAttribute('lang', 'nl');
    expect(chooseLanguage()).toBe('en');
  });

  it('keeps an explicit default_language over the page and the browser', () => {
    setBrowser('it-IT');
    document.documentElement.setAttribute('lang', 'it');
    expect(chooseLanguage('en')).toBe('en');
    expect(chooseLanguage('de')).toBe('de');
    expect(chooseLanguage('FR-ca')).toBe('fr');
  });

  it('detects the language when default_language is one the widget does not have', () => {
    setBrowser('en-US');
    document.documentElement.setAttribute('lang', 'es-ES');
    expect(chooseLanguage('nl')).toBe('es');
  });

  it('keeps German on the swarovski theme unless default_language is set', () => {
    setBrowser('it-IT');
    document.documentElement.setAttribute('lang', 'it');
    expect(chooseLanguage(undefined, 'swarovski')).toBe('de');
    expect(chooseLanguage('en', 'swarovski')).toBe('en');
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

  it('scrolls in list px inside a scaled page frame', () => {
    // The frame shows the list at half size: client rects are half the list px.
    const { list, link, place } = setup();
    Object.defineProperty(list, 'offsetHeight', { configurable: true, value: 200 });
    list.getBoundingClientRect = () => ({ top: 50, bottom: 150, height: 100 } as DOMRect);
    place(20, 30);
    revealInScrollContainer(link);
    expect(list.scrollTop).toBe(440);
  });

  it('takes no scale from a fractional list height', () => {
    // 76.25 px tall: offsetHeight reads 76. As a scale of 1.003, 1474 px of
    // scrolling stopped 4.5 px short of the link.
    const { list, link, place } = setup('overflow-y: auto; box-sizing: border-box; height: 76.25px');
    Object.defineProperty(list, 'offsetHeight', { configurable: true, value: 76 });
    list.scrollTop = 1558;
    list.getBoundingClientRect = () => ({ top: 100, bottom: 176.25, height: 76.25 } as DOMRect);
    place(-1374, -1332);
    revealInScrollContainer(link);
    expect(list.scrollTop).toBe(84);
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

describe('visual viewport tracking', () => {
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
  const stops: Array<() => void> = [];
  const variables = (element: HTMLElement) =>
    Object.values(VISUAL_VIEWPORT_PROPERTIES).map((property) => element.style.getPropertyValue(property));
  const track = (element: HTMLElement) => {
    const stop = trackVisualViewport(element);
    stops.push(stop);
    return stop;
  };

  beforeEach(() => {
    viewport = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  });

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    jest.restoreAllMocks();
    if (jsdomVisualViewport) Object.defineProperty(window, 'visualViewport', jsdomVisualViewport);
    else delete (window as { visualViewport?: unknown }).visualViewport;
  });

  it('sets the visible box at once', () => {
    const element = document.createElement('div');
    viewport.offsetLeft = 43;
    viewport.offsetTop = 88;

    track(element);

    expect(variables(element)).toEqual(['43px', '88px', '412px', '839px']);
  });

  it('follows a pan and the on-screen keyboard in the same event', () => {
    const element = document.createElement('div');
    track(element);

    viewport.offsetLeft = 43;
    viewport.dispatchEvent(new Event('scroll'));
    expect(variables(element)).toEqual(['43px', '0px', '412px', '839px']);

    viewport.height = 500;
    viewport.dispatchEvent(new Event('resize'));
    expect(variables(element)).toEqual(['43px', '0px', '412px', '500px']);
  });

  it('follows a window resize', () => {
    // A wider host page makes the layout viewport larger and fires a window resize.
    const element = document.createElement('div');
    track(element);

    viewport.width = 400;
    window.dispatchEvent(new Event('resize'));

    expect(variables(element)).toEqual(['0px', '0px', '400px', '839px']);
  });

  it('removes the box while the visitor pinch-zooms in, and sets it again at scale 1', () => {
    const element = document.createElement('div');
    track(element);

    Object.assign(viewport, { scale: 2, offsetLeft: 50, offsetTop: 150, width: 206, height: 419.5 });
    viewport.dispatchEvent(new Event('resize'));
    expect(variables(element)).toEqual(['', '', '', '']);

    Object.assign(viewport, { scale: 1, offsetLeft: 0, offsetTop: 0, width: 412, height: 839 });
    viewport.dispatchEvent(new Event('resize'));
    expect(variables(element)).toEqual(['0px', '0px', '412px', '839px']);
  });

  describe('on a page that the browser scales up (#82)', () => {
    // width=320 on a 740 x 360 phone in landscape: a page scale of 2.3125.
    const root = document.documentElement as unknown as { clientWidth?: number };
    beforeEach(() => {
      Object.defineProperty(root, 'clientWidth', { configurable: true, value: 320 });
      Object.assign(viewport, { width: 320, height: 156, scale: 2.3125 });
    });
    afterEach(() => {
      delete root.clientWidth;
    });

    it('treats the page scale as no pinch zoom', () => {
      expect(getPageScale()).toBe(2.3125);
      const element = document.createElement('div');
      track(element);
      expect(variables(element)).toEqual(['0px', '0px', '320px', '156px']);
    });

    it('removes the box while the visitor zooms in beyond the page scale', () => {
      const element = document.createElement('div');
      track(element);

      Object.assign(viewport, { scale: 4.625, offsetLeft: 80, offsetTop: 40, width: 160, height: 78 });
      viewport.dispatchEvent(new Event('resize'));
      expect(getPageScale()).toBe(2.3125);
      expect(variables(element)).toEqual(['', '', '', '']);
    });
  });

  it('writes a variable only when its value changes', () => {
    const element = document.createElement('div');
    track(element);
    const setProperty = jest.spyOn(element.style, 'setProperty');

    viewport.dispatchEvent(new Event('scroll'));
    expect(setProperty).not.toHaveBeenCalled();

    viewport.offsetTop = 88;
    viewport.dispatchEvent(new Event('scroll'));
    expect(setProperty.mock.calls).toEqual([['--cl-visual-viewport-top', '88px']]);
  });

  it('stops after cleanup and keeps the last box', () => {
    const element = document.createElement('div');
    const stop = track(element);

    stop();
    viewport.width = 300;
    viewport.dispatchEvent(new Event('resize'));

    // The last box stays, so a closing window does not jump.
    expect(variables(element)).toEqual(['0px', '0px', '412px', '839px']);
  });

  it('shares one set of event listeners between all listeners', () => {
    const addListener = jest.spyOn(viewport, 'addEventListener');
    const removeListener = jest.spyOn(viewport, 'removeEventListener');
    const first = jest.fn();
    const second = jest.fn();

    const stopFirst = subscribeVisualViewport(first);
    const stopSecond = subscribeVisualViewport(second);
    expect(addListener.mock.calls.map(([type]) => type)).toEqual(['resize', 'scroll']);
    expect(first).toHaveBeenCalledWith({ offsetLeft: 0, offsetTop: 0, width: 412, height: 839 });

    viewport.height = 500;
    viewport.dispatchEvent(new Event('resize'));
    expect(first).toHaveBeenLastCalledWith(expect.objectContaining({ height: 500 }));
    expect(second).toHaveBeenLastCalledWith(expect.objectContaining({ height: 500 }));

    stopFirst();
    expect(removeListener).not.toHaveBeenCalled();
    stopSecond();
    expect(removeListener.mock.calls.map(([type]) => type)).toEqual(['resize', 'scroll']);
  });

  it('gives no box without a visual viewport', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
    const element = document.createElement('div');
    const listener = jest.fn();

    const stop = track(element);
    stops.push(subscribeVisualViewport(listener));

    expect(variables(element)).toEqual(['', '', '', '']);
    expect(listener).toHaveBeenCalledWith(null);
    expect(() => stop()).not.toThrow();
  });
});

describe('visualViewportInset', () => {
  it('measures the top and left insets from the visible corner', () => {
    expect(visualViewportInset('top', '20px')).toBe('calc(var(--cl-visual-viewport-top, 0px) + 20px)');
    expect(visualViewportInset('left', '32px')).toBe('calc(var(--cl-visual-viewport-left, 0px) + 32px)');
  });

  it('adds the hidden strip of the layout viewport to the bottom and right insets', () => {
    // 100% is the layout viewport. Without the variables, both terms cancel out.
    expect(visualViewportInset('bottom', '20px')).toBe(
      'calc(100% - var(--cl-visual-viewport-top, 0px) - var(--cl-visual-viewport-height, 100%) + 20px)'
    );
    expect(visualViewportInset('right', 'calc(var(--cl-bottom-offset) + 80px)')).toBe(
      'calc(100% - var(--cl-visual-viewport-left, 0px) - var(--cl-visual-viewport-width, 100%) + calc(var(--cl-bottom-offset) + 80px))'
    );
  });
});
