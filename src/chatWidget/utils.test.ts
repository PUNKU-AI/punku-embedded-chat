import { detectBrowserLanguage } from './utils';

describe('detectBrowserLanguage', () => {
  const originalNavigator = global.navigator;

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
