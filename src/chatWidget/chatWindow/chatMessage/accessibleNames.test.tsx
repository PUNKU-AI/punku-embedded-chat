import React from 'react';
import { render, screen } from '@testing-library/react';
import ChatMessage, { linkDestination, nameText } from './index';

// Real markdown rendering: every control in an answer has a name that a
// screen reader reads (WCAG 4.1.2), also when the agent writes an image link
// or a task list.

jest.mock('../../../controllers', () => ({
  sendFeedback: jest.fn(),
}));

const renderAnswer = (message: string) =>
  render(<ChatMessage message={message} isSend={false} message_id="answer" host_url="http://localhost:3000" />);

describe('names of the controls in answers', () => {
  it('names a link that shows only an image without alt text by the site it goes to', () => {
    renderAnswer('[![](https://example.com/plan.png)](https://tickets.example.com/plan)');

    const link = screen.getByRole('link', { name: 'tickets.example.com' });
    expect(link).toHaveAttribute('href', 'https://tickets.example.com/plan');
  });

  it('keeps the name of an image link with alt text and of a text link', () => {
    renderAnswer('[![Floor plan](https://example.com/plan.png)](https://example.com/plan)\n\n[Prices](https://example.com/prices)');

    expect(screen.getByRole('link', { name: 'Floor plan' })).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('link', { name: 'Prices' })).not.toHaveAttribute('aria-label');
  });

  it('keeps the title of an image link without alt text as its name', () => {
    renderAnswer('[![](https://example.com/plan.png)](https://example.com/plan "Floor plan")');

    expect(screen.getByRole('link', { name: 'Floor plan' })).not.toHaveAttribute('aria-label');
  });

  it('names a link that shows only inline HTML by that text, as the bubble shows it', () => {
    renderAnswer('[<img src="https://example.com/plan.png" alt="Floor plan">](https://example.com/plan)');

    const link = screen.getByRole('link', { name: '<img src="https://example.com/plan.png" alt="Floor plan">' });
    // No host name: the name keeps the words the visitor sees (WCAG 2.5.3).
    expect(link).not.toHaveAttribute('aria-label');
  });

  it('names the checkboxes of a task list by their items', () => {
    renderAnswer('- [ ] Towel\n- [x] Ticket');

    const towel = screen.getByRole('checkbox', { name: 'Towel' });
    const ticket = screen.getByRole('checkbox', { name: 'Ticket' });
    expect(towel).not.toBeChecked();
    expect(ticket).toBeChecked();
    expect(towel).toBeDisabled();
  });

  it('names the checkboxes of a loose task list, without the text of a nested list', () => {
    renderAnswer('- [ ] Swimwear\n\n  - Towel\n  - Shampoo\n\n- [x] **Ticket** for 2');

    expect(screen.getByRole('checkbox', { name: 'Swimwear' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ticket for 2' })).toBeInTheDocument();
  });

  it('leaves the items of a plain list without a checkbox', () => {
    renderAnswer('- Towel\n- Ticket');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('tables in answers', () => {
  const widths = (scrollWidth: number, clientWidth: number) => [
    jest.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth),
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth),
  ];
  const table = '| Ticket | Price |\n| --- | --- |\n| Adults | 18,00 € |';

  afterEach(() => jest.restoreAllMocks());

  it('takes the keyboard focus while it is wider than the answer, so Safari can scroll it', () => {
    widths(640, 280);
    renderAnswer(table);

    expect(screen.getByRole('table')).toHaveAttribute('tabindex', '0');
  });

  it('is no tab stop when it fits', () => {
    widths(280, 280);
    renderAnswer(table);

    expect(screen.getByRole('table')).not.toHaveAttribute('tabindex');
  });
});

describe('sender label', () => {
  it('reads who wrote a message before it, outside the bubble', () => {
    render(<ChatMessage message="Prices?" isSend={true} host_url="http://localhost:3000" senderLabel="You:" />);

    const label = screen.getByText('You:');
    expect(label).toHaveClass('cl-sr-only');
    expect(label.parentElement).toHaveClass('cl-chat-message');
    // The bubble keeps only the message text.
    expect(document.querySelector('.cl-user_message')?.textContent).toBe('Prices?');
  });

  it('adds no label without one', () => {
    render(<ChatMessage message="Prices?" isSend={true} host_url="http://localhost:3000" />);

    expect(document.querySelector('.cl-sr-only')).not.toBeInTheDocument();
  });
});

describe('nameText', () => {
  it('reads inline HTML as the text it shows', () => {
    expect(nameText({ type: 'element', tagName: 'a', children: [{ type: 'raw', value: '<b>Plan</b>' }] })).toBe('<b>Plan</b>');
  });

  it('reads text and image alt text, without nested lists', () => {
    expect(nameText({
      type: 'element',
      tagName: 'li',
      children: [
        { type: 'text', value: ' Bring ' },
        { type: 'element', tagName: 'img', properties: { alt: 'a towel' } },
        { type: 'element', tagName: 'ul', children: [{ type: 'text', value: 'nested' }] },
      ],
    })).toBe('Bring a towel');
  });
});

describe('linkDestination', () => {
  it('gives the host name, else the link itself', () => {
    expect(linkDestination('https://tickets.example.com/plan?x=1')).toBe('tickets.example.com');
    expect(linkDestination('mailto:info@example.com')).toBe('mailto:info@example.com');
    expect(linkDestination(undefined)).toBeUndefined();
  });
});
