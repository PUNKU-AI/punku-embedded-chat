import React from 'react';
import { render, screen } from '@testing-library/react';
import ChatMessage from './index';
import { markdownToPlainText } from '../plainText';

// Real markdown rendering. GitHub footnotes link to ids in the answer, but the
// closed shadow root hides those ids from the host page: a link would change
// the page's URL and lead nowhere. The answers show them as plain text.

jest.mock('../../../controllers', () => ({
  sendFeedback: jest.fn(),
}));

const answer = [
  'Tickets cost 12 euros.[^price] Children under 6 go free.[^kids]',
  '',
  'The museum is open daily.[^price]',
  '',
  '[^price]: Prices of 2026.',
  '[^kids]: With an adult.',
].join('\n');

const renderAnswer = (message: string, props: Partial<React.ComponentProps<typeof ChatMessage>> = {}) =>
  render(<ChatMessage message={message} isSend={false} message_id="answer" host_url="http://localhost:3000" {...props} />);

describe('footnotes in answers', () => {
  it('shows the footnotes as plain text, without links or back links', () => {
    renderAnswer(answer);

    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(screen.getByText('Prices of 2026.')).toBeInTheDocument();
    expect(screen.getByText('With an adult.')).toBeInTheDocument();
    expect(document.querySelector('.markdown-body')).not.toHaveTextContent('↩');
  });

  it('keeps the numbers in the text, with the brackets of the markdown stylesheet', () => {
    renderAnswer(answer);

    const numbers = Array.from(document.querySelectorAll('sup > span[data-footnote-ref]'));
    expect(numbers.map((number) => number.textContent)).toEqual(['1', '2', '1']);
    for (const number of numbers) {
      expect(number.getAttributeNames().sort()).toEqual(['data-footnote-ref']);
    }
  });

  it('gives the footnotes a heading for screen readers in the chat language', () => {
    renderAnswer(answer, { footnotesLabel: 'Fußnoten', language: 'de' });

    const heading = screen.getByRole('heading', { level: 3, name: 'Fußnoten' });
    expect(heading).toHaveClass('cl-sr-only');
    expect(heading).toHaveAttribute('lang', 'de');
    // The footnote texts keep the language of the answer.
    expect(screen.getByText('Prices of 2026.').closest('[lang]')).toBeNull();
  });

  it('names the heading in English by default', () => {
    renderAnswer(answer);

    expect(screen.getByRole('heading', { level: 3, name: 'Footnotes' })).toHaveClass('cl-sr-only');
  });

  it('gives no ids, which each answer would repeat in the shadow root', () => {
    const { container } = renderAnswer(answer);

    expect(container.querySelectorAll('[id]')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-describedby]')).toHaveLength(0);
  });

  it('drops the back links also from a footnote that ends with a list', () => {
    renderAnswer('See the days.[^days]\n\n[^days]: Open on:\n\n    - Monday\n    - Tuesday');

    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(screen.getByText('Tuesday')).toBeInTheDocument();
  });

  it('leaves the links of the answer and of a footnote', () => {
    renderAnswer('Book [online](https://tickets.example.com).[^1]\n\n[^1]: See [the prices](https://example.com/prices).');

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href')))
      .toEqual(['https://tickets.example.com', 'https://example.com/prices']);
  });

  // The status region reads each answer as plain text (plainText.ts). Its
  // footnotes must have the numbers and the notes that the screen shows.
  it.each([
    ['notes at the end and a mark used twice', answer],
    ['notes in the middle', 'Tickets cost 12 euros.[^price] Children under 6 go free.[^kids]\n\n[^kids]: With an adult.\n'
      + '[^price]: Prices of [2026](https://example.com/prices).\n\nThe museum is open daily.[^price]'],
    ['a mark in a note', 'A[^a] B[^b]\n\n[^a]: See also[^c].\n[^b]: Two.\n[^c]: Three.'],
    ['labels in other cases, a note without a mark and a mark without a note', 'Prices[^Note] and hours[^9].[^x]\n\n[^note]: First.\n[^NOTE]: Second.\n[^y]: Never used.\n[^x]: Last.'],
    ['a note of several lines and paragraphs', 'See the days.[^days]\n\n[^days]: Open on\nweekdays:\n\n    - Monday\n    - Tuesday\n\nWelcome![^1][^2]\n\n[^1]: One.\n[^2]: Two.'],
  ])('reads the footnote numbers and notes that the screen shows: %s', (_case, markdown) => {
    renderAnswer(markdown);
    const shown = document.querySelector('.markdown-body')!.cloneNode(true) as HTMLElement;
    // The stylesheet adds the brackets around each number.
    shown.querySelectorAll('[data-footnote-ref]').forEach((mark) => {
      mark.textContent = `[${mark.textContent}]`;
    });
    const words = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();
    const noteItems = Array.from(shown.querySelectorAll('[data-footnotes] > ol > li'));
    const shownNotes = noteItems.map((item) => words(item.textContent));
    noteItems.forEach((item) => item.remove());
    const shownMarks = shown.textContent!.match(/\[\^?\w+\]/g);

    const [spokenText, spokenNotes = ''] = markdownToPlainText(markdown, 'Footnotes').split('\n\nFootnotes\n');
    expect(spokenText.match(/\[\^?\w+\]/g)).toEqual(shownMarks);
    expect(spokenNotes.split(/\n(?=\d+\. )/).map((note) => words(note.replace(/^\d+\. /, '')))).toEqual(shownNotes);
    expect(spokenNotes.split(/\n(?=\d+\. )/).map((note) => note.split('. ')[0])).toEqual(shownNotes.map((_note, index) => `${index + 1}`));
  });
});
