import React from 'react';
import { render, screen } from '@testing-library/react';
import ChatMessage from './index';

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
});
