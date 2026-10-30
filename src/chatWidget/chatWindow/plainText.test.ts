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
      .toBe('Book our ticket page or the shop.\n\nPrices[^1]\n\n[^1]: Children pay half.');
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
  });

  it('leaves out a link that shows only an image without alt text', () => {
    expect(markdownToPlainText('Floor plan: [![](https://example.com/plan.png)](https://example.com/plan)'))
      .toBe('Floor plan:');
    expect(markdownToPlainText('[![Floor plan](https://example.com/plan.png)](https://example.com/plan)'))
      .toBe('Floor plan');
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
