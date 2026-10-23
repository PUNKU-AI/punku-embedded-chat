import { chooseLoadingMessages, detectLanguage, splitThinkingText } from './phrases';
import { LANGUAGES, crystallineThinkingMessages, thinkingMessages } from '../translations';

// Thinking texts modelled on live embeds (October 2026). Names, brands and
// distinctive nouns are replaced; the words that carry the language stay.
const sites = {
  englishBooking: ['Finding the best options…', 'Checking availability and prices…', 'Preparing your booking…'],
  englishSupport: ['Analyzing your request...', 'Preparing an answer...', 'Searching the ACME knowledge base...', 'Gathering relevant information...'],
  englishSweets: [
    'Melting some cocoa magic... 🍫', 'Looking that up for you... 🍫', 'Sweet answer coming right up...',
    'Preparing your answer...', 'One moment, I’m checking that for you 🍫',
  ],
  englishTours: [
    'Swirling through the archive...', 'Brewing your answer...', 'Pairing the perfect response...', 'Unpacking the details...',
    'Letting it settle...', 'Browsing through our tours...', 'Pouring over the options...', 'Sampling the best picks...',
  ],
  germanShow: [
    'Anna & Ben schauen kurz in den Kalender...', 'Einen Moment, wir rücken kurz die Stühle zurecht...',
    'Gleich gehts los, wir suchen die besten Plätze für dich raus!', 'Anna & Ben bereiten alles für deinen Abend vor...',
    'Einen Augenblick Geduld, wir schauen gleich nach...',
  ],
  germanCasual: [
    'Lass mich mal schauen', 'Ich mache ja schon', 'Hetz mich nicht, Freund', 'Alles klar, ich suche',
    'Da muss ich mal den Kollegen fragen, einen Moment', 'Ich frage mal den Chef, einen Moment',
  ],
  germanPolite: ['Einen Augenblick bitte …', 'Ich prüfe das kurz …', 'Ich bin gleich wieder da …', 'Einen Moment – ich schaue nach.', 'Ich sammle die Infos für dich …'],
  germanMotor: ['Motor wird warmgelaufen...', 'Zündung wird aktiviert...', 'Schalte in den nächsten Gang...', 'Der Wagen wird aus der Garage geholt...', 'Tankstelle wird angesteuert..'],
  germanEmoji: [
    '✨ Einen Moment, ich schaue in meine Glaskugel...', '🏔️ Ich wandere gerade durch die Berge, um die beste Antwort zu finden...',
    '🍺 Halt mal mein Glas — ich schau das kurz nach...', '🪄 Ein bisschen Magie braucht seine Zeit... Gleich hab ich\'s!',
    '🏰 Ich durchsuche gerade das Schloss nach der perfekten Antwort...',
  ],
  germanEmojiTail: [
    'Mia sucht im Archiv nach der Antwort… 🚣', 'Kurs wird berechnet… fast da! ⛵', 'Mia checkt die Verfügbarkeit… 📋',
    'Die Karten werden sortiert… 🛶', 'Mia schaut auf den Plan… 🗺️', 'Wird nachgeschlagen… gleich geht es los! ☀️',
  ],
  germanAgent: ['Agent antwortet ...'],
  englishAgent: ['Agent responding ...'],
  italianTyping: ['Sta digitando...'],
  italianEmoji: [
    '⚔️ Consulto le pergamene del castello...', '🏰 Esploro le sale segrete per te...', '📜 Sfoglio gli archivi della torre...',
    '🗡️ Il cavaliere sta preparando la risposta...', '✨ Un paggio cerca la soluzione migliore...', '🔮 Interrogo il saggio del castello...',
    '🛡️ Preparo le informazioni con cura regale...', '🌟 Quasi pronto, nobile visitatore...', '🐉 Attraverso il ponte levatoio dei dati...',
    '👑 Un momento, sto consultando la corte reale...',
  ],
};

describe('detectLanguage', () => {
  it.each([
    ['englishBooking', 'en'],
    ['englishSupport', 'en'],
    ['englishSweets', 'en'],
    ['englishTours', 'en'],
    ['germanShow', 'de'],
    ['germanCasual', 'de'],
    ['germanPolite', 'de'],
    ['germanMotor', 'de'],
    ['germanEmoji', 'de'],
    ['germanEmojiTail', 'de'],
    ['italianEmoji', 'it'],
  ] as const)('finds the language of the %s texts', (site, language) => {
    expect(detectLanguage(sites[site])).toBe(language);
  });

  it.each(['germanAgent', 'englishAgent', 'italianTyping'] as const)('is unsure about the short %s text', (site) => {
    expect(detectLanguage(sites[site])).toBeNull();
  });

  it.each(LANGUAGES)('finds %s in the built-in phrases of that language', (language) => {
    expect(detectLanguage(thinkingMessages[language])).toBe(language);
  });

  it('never takes one built-in phrase for another language', () => {
    for (const language of LANGUAGES) {
      for (const phrase of thinkingMessages[language]) {
        expect([null, language]).toContain(detectLanguage([phrase]));
      }
    }
  });

  it('finds the language of the crystal phrases', () => {
    expect(detectLanguage(crystallineThinkingMessages.map((message) => message.en))).toBe('en');
    expect(detectLanguage(crystallineThinkingMessages.map((message) => message.de))).toBe('de');
  });

  it.each([
    ['Spanish', ['Estoy buscando las mejores opciones…', 'Ya casi está…'], 'es'],
    ['Portuguese', ['Vou procurar as melhores opções…', 'Só um momento, não demora…'], 'pt'],
    ['French', ['Je cherche les meilleures options…', 'Un instant, nous vérifions pour vous…'], 'fr'],
    ['Polish', ['Szukam najlepszych opcji dla Ciebie…', 'Już sprawdzam dostępność…'], 'pl'],
    ['Italian', ['Sto cercando le migliori opzioni…', 'Controllo la disponibilità per te…'], 'it'],
  ] as const)('finds %s', (_name, texts, language) => {
    expect(detectLanguage([...texts])).toBe(language);
  });

  it.each([
    ['empty', []],
    ['blank', ['', '   ']],
    ['emoji only', ['🍫🍫🍫', '✨ 💎 ⛵']],
    ['dots only', ['…', '...']],
    ['a sound', ['Hmm…']],
    ['a brand', ['ACME AI']],
    ['one word', ['Moment…']],
    ['two languages', ['Checking the timetable…', 'Ich prüfe den Fahrplan…']],
  ])('is unsure about %s texts', (_case, texts) => {
    expect(detectLanguage(texts)).toBeNull();
  });

  it('finds the language behind emoji', () => {
    expect(detectLanguage(['🔍✨ Ich suche das für dich… 🏔️⛷️', '🎿 Gleich fertig! 🎉'])).toBe('de');
    expect(detectLanguage(['🔍✨ Looking that up for you… 🏔️⛷️'])).toBe('en');
  });
});

describe('chooseLoadingMessages', () => {
  describe('a list in one language', () => {
    it.each(['it', 'pl', 'pt'] as const)('gives a %s chat the built-in phrases for English texts', (language) => {
      expect(chooseLoadingMessages(sites.englishBooking, language)).toBeNull();
    });

    it('keeps English texts in an English chat', () => {
      expect(chooseLoadingMessages(sites.englishBooking, 'en')).toEqual(sites.englishBooking);
    });

    it('gives a German chat the built-in phrases for English texts', () => {
      expect(chooseLoadingMessages(sites.englishSupport, 'de')).toBeNull();
    });

    it.each(['germanShow', 'germanCasual', 'germanPolite', 'germanMotor', 'germanEmoji', 'germanEmojiTail', 'germanAgent'] as const)(
      'keeps the %s texts in a German chat',
      (site) => {
        expect(chooseLoadingMessages(sites[site], 'de')).toEqual(sites[site].map((text) => text.trim()));
      },
    );

    it('keeps a short text that it is unsure about, in any chat', () => {
      expect(chooseLoadingMessages(sites.italianTyping, 'it')).toEqual(['Sta digitando...']);
      expect(chooseLoadingMessages(sites.englishAgent, 'de')).toEqual(['Agent responding ...']);
      expect(chooseLoadingMessages(sites.germanAgent, 'en')).toEqual(['Agent antwortet ...']);
    });

    it('gives an English chat the built-in phrases for Italian texts', () => {
      expect(chooseLoadingMessages(sites.italianEmoji, 'en')).toBeNull();
    });

    it('trims the texts and drops blank ones', () => {
      expect(chooseLoadingMessages(['  Ich prüfe den Fahrplan…  ', '', '   '], 'de')).toEqual(['Ich prüfe den Fahrplan…']);
      expect(chooseLoadingMessages(['', '   '], 'de')).toBeNull();
      expect(chooseLoadingMessages([], 'de')).toBeNull();
    });
  });

  describe('texts per language', () => {
    const perLanguage = {
      it: ['Cerco le migliori opzioni…'],
      'pt-PT': ['Vou procurar as melhores opções…'],
      pl: [],
      default: ['Finding the best options…'],
    };

    it('shows the texts for the chat language', () => {
      expect(chooseLoadingMessages(perLanguage, 'it')).toEqual(['Cerco le migliori opzioni…']);
    });

    it('matches a region tag', () => {
      expect(chooseLoadingMessages(perLanguage, 'pt')).toEqual(['Vou procurar as melhores opções…']);
    });

    it('shows "default" as written for another language, or an empty list', () => {
      expect(chooseLoadingMessages(perLanguage, 'fr')).toEqual(['Finding the best options…']);
      expect(chooseLoadingMessages(perLanguage, 'pl')).toEqual(['Finding the best options…']);
    });

    it('gives the built-in phrases without texts for the language or "default"', () => {
      expect(chooseLoadingMessages({ it: ['Cerco le migliori opzioni…'] }, 'fr')).toBeNull();
      expect(chooseLoadingMessages({}, 'en')).toBeNull();
    });
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'Thinking…'],
    ['a number', 42],
  ])('gives the built-in phrases when loading_messages is %s', (_case, value) => {
    expect(chooseLoadingMessages(value as never, 'en')).toBeNull();
  });
});

describe('splitThinkingText', () => {
  it.each([
    ['Thinking…', ['Thinking', '']],
    ['Sta digitando...', ['Sta digitando', '']],
    ['Agent antwortet ...', ['Agent antwortet', '']],
    ['Tankstelle wird angesteuert..', ['Tankstelle wird angesteuert', '']],
    ['Einen Moment – ich schaue nach.', ['Einen Moment – ich schaue nach', '']],
    ['Einen Augenblick bitte …', ['Einen Augenblick bitte', '']],
    ['Lass mich mal schauen', ['Lass mich mal schauen', '']],
    ['Gleich gehts los!', ['Gleich gehts los!', '']],
    ['Wait… almost there', ['Wait… almost there', '']],
    ['Die Karten werden sortiert… 🛶', ['Die Karten werden sortiert', ' 🛶']],
    ['Mia schaut auf den Plan… 🗺️', ['Mia schaut auf den Plan', ' 🗺️']],
    ['Wird nachgeschlagen… gleich geht es los! ☀️', ['Wird nachgeschlagen… gleich geht es los!', ' ☀️']],
    ['One moment, I’m checking that for you 🍫', ['One moment, I’m checking that for you', ' 🍫']],
    ['Polishing the answer... ✨💎', ['Polishing the answer', ' ✨💎']],
    ['⚔️ Consulto le pergamene del castello...', ['⚔️ Consulto le pergamene del castello', '']],
    ['…', ['', '']],
    ['🍫', ['', '🍫']],
  ])('splits %j', (text, parts) => {
    expect(splitThinkingText(text)).toEqual(parts);
  });
});
