import { fireEvent, render, screen } from '@testing-library/react';
import CheckoutCard, { CheckoutCards, CheckoutCardsContext, CheckoutLinkParagraph } from './CheckoutCard';
import type { CheckoutCardData } from '../checkoutCards';

// Made-up carts, experiences and venues. The repository is public.
const url = 'https://eu5.bookingkit.de/cart/set/1234567890abcdef1234567890abcdef?utm_source=web_chat&c=%5B%5D';
const otherUrl = 'https://eu5.bookingkit.de/cart/set/fedcba0987654321fedcba0987654321?utm_source=web_chat&c=%5B%5D';

const descriptionOf = (element: HTMLElement) => (element.getAttribute('aria-describedby') || '')
  .split(' ').map((id) => document.getElementById(id)?.textContent).join(' / ');

describe('CheckoutCard', () => {
  it('shows the title, the venue and the button with the label', () => {
    render(<CheckoutCard title="2 Tickets · Nachtführung in der Alten Mühle" venue="Burg Beispielstein" label="Tickets buchen" href={url} />);

    const card = document.querySelector('.cl-checkout-card')!;
    expect(card.querySelector('.cl-checkout-card-title')).toHaveTextContent('2 Tickets · Nachtführung in der Alten Mühle');
    expect(card.querySelector('.cl-checkout-card-meta')).toHaveTextContent('Burg Beispielstein');
    const button = screen.getByRole('link', { name: 'Tickets buchen' });
    expect(button).toHaveClass('cl-checkout-card-button');
    expect(button).toHaveAttribute('href', url);
    expect(button).toHaveAttribute('target', '_blank');
    expect(button).toHaveAttribute('rel', 'noopener noreferrer');
    expect(button).not.toHaveAttribute('title');
    // The card holds one interactive element: the button.
    expect(card.querySelectorAll('a, button')).toHaveLength(1);
    expect(descriptionOf(button)).toBe('2 Tickets · Nachtführung in der Alten Mühle / Burg Beispielstein');
  });

  it('leaves out the venue line without a venue', () => {
    render(<CheckoutCard title="4 people · Kayak at sunset" label="Book now" href={url} />);

    expect(document.querySelector('.cl-checkout-card-meta')).toBeNull();
    expect(descriptionOf(screen.getByRole('link', { name: 'Book now' }))).toBe('4 people · Kayak at sunset');
  });

  it('gives each card its own ids', () => {
    render(<>
      <CheckoutCard title="1 bilet · Rejs statkiem po jeziorze" venue="Przystań Przykładowa" label="Zarezerwuj bilety" href={url} />
      <CheckoutCard title="5 biletów · Rejs statkiem po jeziorze" venue="Przystań Przykładowa" label="Zarezerwuj bilety" href={otherUrl} />
    </>);

    const [first, second] = screen.getAllByRole('link');
    expect(first.getAttribute('aria-describedby')).not.toBe(second.getAttribute('aria-describedby'));
    expect(descriptionOf(second)).toBe('5 biletów · Rejs statkiem po jeziorze / Przystań Przykładowa');
  });

  it('opens the on-page checkout with the button', () => {
    const onCheckout = jest.fn(() => true);
    render(<CheckoutCard title="2 billets · Atelier de chocolat" label="Réserver les billets" href={url} onCheckout={onCheckout} />);

    const button = screen.getByRole('link', { name: 'Réserver les billets' });
    expect(fireEvent.click(button)).toBe(false);
    expect(onCheckout).toHaveBeenCalledWith(url, button);
  });
});

describe('CheckoutLinkParagraph', () => {
  const card = (booking: Partial<CheckoutCardData['bookings'][0]> = {}, cardUrl = url): CheckoutCardData => ({
    url: cardUrl, locale: null, bookings: [{ count: 2, unit: 'person', product: 'Passeio de barco no rio', ...booking }],
  });
  const renderParagraph = (value: CheckoutCards | null) => render(
    value ? (
      <CheckoutCardsContext.Provider value={value}>
        <CheckoutLinkParagraph href={url}><a href={url}>Agent link</a></CheckoutLinkParagraph>
      </CheckoutCardsContext.Provider>
    ) : <CheckoutLinkParagraph href={url}><a href={url}>Agent link</a></CheckoutLinkParagraph>,
  );

  it('shows the card of its link, in the card or chat language', () => {
    renderParagraph({ cards: [card()], language: 'pt', venue: 'Cais do Exemplo' });

    expect(document.querySelector('.cl-checkout-card-title')).toHaveTextContent('2 bilhetes · Passeio de barco no rio');
    expect(document.querySelector('.cl-checkout-card-meta')).toHaveTextContent('Cais do Exemplo');
    // The widget's label replaces the agent's link text.
    expect(screen.getByRole('link')).toHaveAccessibleName('Reservar bilhetes');
    expect(document.querySelector('p')).toBeNull();
  });

  it.each([
    ['no cards', null],
    ['a card for another link', { cards: [card({}, otherUrl)], language: 'en' }],
    ['a card without a name', { cards: [card({ product: null })], language: 'en' }],
    ['a card with two bookings', {
      cards: [{ ...card(), bookings: [card().bookings[0], { count: 1, unit: 'group', product: 'Kayak at sunset' }] }],
      language: 'en',
    }],
  ] as const)('keeps the filled link button with %s', (_, value) => {
    renderParagraph(value as CheckoutCards | null);

    expect(document.querySelector('.cl-checkout-card')).toBeNull();
    expect(document.querySelector('p')).toHaveClass('cl-link-only');
    expect(screen.getByRole('link')).toHaveAccessibleName('Agent link');
  });
});
