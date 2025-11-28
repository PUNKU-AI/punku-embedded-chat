import { getChatPosition, getAnimationOrigin, extractMessageFromOutput, detectBrowserLanguage } from './utils';

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
