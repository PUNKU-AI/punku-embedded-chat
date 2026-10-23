import { LANGUAGES, thinkingMessages, toLanguage, translations } from './index';

describe('built-in texts', () => {
  const keys = Object.keys(translations.en).sort();

  it.each(LANGUAGES.map((language) => [language]))('%s has every text', (language) => {
    const texts = translations[language];
    expect(Object.keys(texts).sort()).toEqual(keys);
    for (const key of keys) {
      const text = texts[key as keyof typeof texts];
      expect(typeof text).toBe('string');
      expect(text.trim()).not.toBe('');
    }
  });

  // These texts are names or brands, or the same word in that language.
  const sameAsEnglish = new Set(['onlineMessage', 'offlineMessage', 'windowTitle', 'messageList']);

  it.each(LANGUAGES.filter((language) => language !== 'en').map((language) => [language]))(
    '%s translates the English texts',
    (language) => {
      const untranslated = keys.filter((key) =>
        !sameAsEnglish.has(key)
        && translations[language][key as keyof typeof translations.en] === translations.en[key as keyof typeof translations.en]);
      expect(untranslated).toEqual([]);
    },
  );

  // The AI notice under the input (EU AI Act, Article 50). A change to one of
  // these texts needs a native speaker's review.
  it('has the reviewed AI notice in every language', () => {
    expect(Object.fromEntries(LANGUAGES.map((language) => [language, translations[language].aiNotice]))).toEqual({
      en: 'You are chatting with an AI assistant.',
      de: 'Sie chatten mit einem KI-Assistenten.',
      it: 'Stai chattando con un assistente IA.',
      es: 'Estás chateando con un asistente de IA.',
      pt: 'Está a conversar com um assistente de IA.',
      fr: 'Vous discutez avec un assistant IA.',
      pl: 'Rozmawiasz z asystentem AI.',
    });
  });

  it.each(LANGUAGES.map((language) => [language]))('%s has its own thinking phrases', (language) => {
    const phrases = thinkingMessages[language];
    expect(phrases.length).toBeGreaterThanOrEqual(10);
    expect(new Set(phrases).size).toBe(phrases.length);
    for (const phrase of phrases) expect(phrase.trim()).not.toBe('');
  });

  it.each(LANGUAGES.filter((language) => language !== 'en').map((language) => [language]))(
    '%s does not reuse the English thinking phrases',
    (language) => {
      // "Hmm…" is the same in every language.
      expect(thinkingMessages[language].filter((phrase) => phrase !== 'Hmm…' && thinkingMessages.en.includes(phrase))).toEqual([]);
    },
  );

  it('keeps the 30 German and the 30 English thinking phrases', () => {
    expect(thinkingMessages.de).toHaveLength(30);
    expect(thinkingMessages.en).toHaveLength(30);
    expect(thinkingMessages.de[0]).toBe('Überlege…');
    expect(thinkingMessages.de[29]).toBe('Ordne meine Gedanken…');
  });
});

describe('toLanguage', () => {
  it.each([
    ['it', 'it'],
    ['it-IT', 'it'],
    ['IT', 'it'],
    ['pt_BR', 'pt'],
    ['pt-PT', 'pt'],
    [' es-419 ', 'es'],
    ['fr-CA', 'fr'],
    ['pl', 'pl'],
    ['de-AT', 'de'],
    ['en-US', 'en'],
  ])('reads %p as %p', (tag, language) => {
    expect(toLanguage(tag)).toBe(language);
  });

  it.each([['nl'], ['nl-NL'], ['zh-Hans'], [''], [undefined], [null], [42]])('has no language for %p', (tag) => {
    expect(toLanguage(tag)).toBeNull();
  });
});
