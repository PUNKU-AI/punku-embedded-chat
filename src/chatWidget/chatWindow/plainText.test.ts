import { markdownToPlainText } from './plainText';

describe('markdownToPlainText', () => {
  it('keeps plain text unchanged', () => {
    expect(markdownToPlainText('We open at 10:00. Tickets cost 12 €.')).toBe('We open at 10:00. Tickets cost 12 €.');
  });

  it('reads link text without the URL', () => {
    expect(markdownToPlainText('Book on [our ticket page](https://example.com/tickets?day=mon).'))
      .toBe('Book on our ticket page.');
  });

  it('reads a reference link as its text and leaves out its definition, but keeps a footnote', () => {
    expect(markdownToPlainText('Book [our ticket page][tickets] or [the shop][].\n\n[tickets]: https://example.com/tickets\n'
      + '  [the shop]: <https://example.com/shop> "Shop"\n\nPrices[^1]\n\n[^1]: Children pay half.'))
      .toBe('Book our ticket page or the shop.\n\nPrices[1]\n\nFootnotes\n1. Children pay half.');
  });

  // The screen shows a footnote mark as its number in brackets, and the notes
  // at the end under a heading for screen readers (chatMessage plainFootnotes).
  describe('footnotes', () => {
    it('reads the marks as their numbers, in the order of first use, and the notes at the end', () => {
      expect(markdownToPlainText([
        'Tickets cost 12 euros.[^price] Children under 6 go free.[^kids]',
        '',
        '[^kids]: With an adult.',
        '[^price]: Prices of [2026](https://example.com/prices).',
        '',
        'The museum is open daily.[^price]',
      ].join('\n'), 'Fußnoten')).toBe([
        'Tickets cost 12 euros.[1] Children under 6 go free.[2]',
        '',
        'The museum is open daily.[1]',
        '',
        'Fußnoten',
        '1. Prices of 2026.',
        '2. With an adult.',
      ].join('\n'));
    });

    it('keeps two marks in a row apart', () => {
      expect(markdownToPlainText('Open daily.[^1][^2]\n\n[^1]: Except Monday.\n[^2]: Until 6 pm.'))
        .toBe('Open daily.[1][2]\n\nFootnotes\n1. Except Monday.\n2. Until 6 pm.');
    });

    it('reads a note of several lines and paragraphs without its marks', () => {
      expect(markdownToPlainText('See the days.[^days]\n\n[^days]: Open on\nweekdays:\n\n    - **Monday**\n    - Tuesday\n\nWelcome!'))
        .toBe('See the days.[1]\n\nWelcome!\n\nFootnotes\n1. Open on\nweekdays:\n\nMonday\nTuesday');
    });

    it('leaves out a note without a mark, and keeps a mark without a note as typed', () => {
      expect(markdownToPlainText('Prices[^1] and hours[^9].\n\n[^1]: Of 2026.\n[^2]: Never used.'))
        .toBe('Prices[1] and hours[^9].\n\nFootnotes\n1. Of 2026.');
      expect(markdownToPlainText('Hours[^9].\n\n[^2]: Never used.')).toBe('Hours[^9].');
    });

    it('matches labels without case, and the first note of a label wins', () => {
      expect(markdownToPlainText('Prices[^Note]\n\n[^note]: First.\n[^NOTE]: Second.'))
        .toBe('Prices[1]\n\nFootnotes\n1. First.');
    });

    it('numbers a mark in a note after the marks of the answer', () => {
      expect(markdownToPlainText('A[^a] B[^b]\n\n[^a]: See also[^c].\n[^b]: Two.\n[^c]: Three.'))
        .toBe('A[1] B[2]\n\nFootnotes\n1. See also[3].\n2. Two.\n3. Three.');
    });

    it('keeps footnote syntax in code, as the screen shows it', () => {
      expect(markdownToPlainText('Write `[^1]` for a note.[^1]\n\n```\n[^1]: not a note\n```\n\n[^1]: A note.'))
        .toBe('Write [^1] for a note.[1]\n\n[^1]: not a note\n\nFootnotes\n1. A note.');
    });

    it('keeps an escaped mark as text', () => {
      expect(markdownToPlainText('Not a mark: \\[^1]\n\n[^1]: Never used.')).toBe('Not a mark: [^1]');
    });
  });

  it('reads the alt text of images', () => {
    expect(markdownToPlainText('![Museum entrance](https://example.com/entrance.jpg)')).toBe('Museum entrance');
  });

  it('removes bold, italic, strikethrough and code marks', () => {
    expect(markdownToPlainText('**Open** *daily* __except__ _Monday_, ~~not~~ `10:00`'))
      .toBe('Open daily except Monday, not 10:00');
  });

  it('keeps underscores and stars inside words and calculations', () => {
    expect(markdownToPlainText('Use the code snake_case_name. 2 * 3 * 4 = 24.'))
      .toBe('Use the code snake_case_name. 2 * 3 * 4 = 24.');
  });

  it('removes heading marks, quote marks and list bullets', () => {
    expect(markdownToPlainText('## Opening hours\n> Note\n- Monday: closed\n* Tuesday: 10:00\n1. First step'))
      .toBe('Opening hours\nNote\nMonday: closed\nTuesday: 10:00\n1. First step');
  });

  it('reads a task list without its check marks', () => {
    expect(markdownToPlainText('- [ ] Towel\n- [x] Ticket\n1. [X] Booked'))
      .toBe('Towel\nTicket\n1. Booked');
    expect(markdownToPlainText('  * [ ] Nested\n> - [x] Quoted')).toBe('Nested\nQuoted');
  });

  it('keeps check marks on a line that is not a list item, as the screen shows them', () => {
    expect(markdownToPlainText('Legende:\n[x] = inklusive\n[ ] = gegen Aufpreis'))
      .toBe('Legende:\n[x] = inklusive\n[ ] = gegen Aufpreis');
  });

  it('leaves out a link that shows only an image without alt text', () => {
    expect(markdownToPlainText('Floor plan: [![](https://example.com/plan.png)](https://example.com/plan)'))
      .toBe('Floor plan:');
    expect(markdownToPlainText('[![Floor plan](https://example.com/plan.png)](https://example.com/plan)'))
      .toBe('Floor plan');
  });

  it('keeps the next lines when an image-only link is not closed', () => {
    expect(markdownToPlainText('Plan: [![](https://example.com/plan.png)](https://example.com/plan\n\nMore (see below).'))
      .toBe('Plan: [](https://example.com/plan\n\nMore (see below).');
  });

  it('reads escaped characters without the backslash, but keeps it in code', () => {
    expect(markdownToPlainText('Price: 10 € \\* plus tax\n1\\. Step\n\\[no link\\]'))
      .toBe('Price: 10 € * plus tax\n1. Step\n[no link]');
    expect(markdownToPlainText('Fri - Sun\\*\n\n*\\*Also on public holidays.*'))
      .toBe('Fri - Sun*\n\n*Also on public holidays.');
    expect(markdownToPlainText('| Day | Price \\| discount |\n| --- | --- |\n| Mon | 10 \\| 8 |'))
      .toBe('Day, Price | discount\n\nMon, 10 | 8');
    expect(markdownToPlainText('[Page](https://example.com/a\\)b) next')).toBe('Page next');
    expect(markdownToPlainText('Path: `C:\\*.txt`\n```\na\\_b\n```')).toBe('Path: C:\\*.txt\na\\_b');
  });

  it('reads a table row by row', () => {
    expect(markdownToPlainText('| Day | Hours |\n| --- | :---: |\n| Monday | closed |'))
      .toBe('Day, Hours\n\nMonday, closed');
  });

  it('keeps the code of a fenced block', () => {
    expect(markdownToPlainText('Use:\n```js\nopen("museum")\n```')).toBe('Use:\nopen("museum")');
  });

  it('removes horizontal rules and extra blank lines', () => {
    expect(markdownToPlainText('First\n\n---\n\n\n\nSecond')).toBe('First\n\nSecond');
  });
});
