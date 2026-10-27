import React from 'react';
import { render } from '@testing-library/react';
import ChatMessage from './index';
import { CardSpeechContext, CardSpeechRegistry, CheckoutCardsContext } from '../../components/CheckoutCard';
import { CheckoutCardData, speakCheckoutCards } from '../../checkoutCards';
import { markdownToPlainText } from '../plainText';

jest.mock('../../../controllers', () => ({
  sendFeedback: jest.fn(),
}));

// Screen readers hear a complete answer from the status region. Each checkout
// card that the screen shows reports its paragraph and its words, and the
// status text replaces exactly those paragraphs (ChatWindow). These tests
// render the real Markdown and prove that the spoken text follows the screen.
// Made-up carts and experiences: the repository is public.

const CART = 'https://eu5.bookingkit.de/cart/set/a1b2c3d4e5f60718293a4b5c6d7e8f90';
const URL_A = `${CART}?c=%5B%5D&utm_source=web_chat&sale_params%5Bpunku_reference%5D=pk_example_speech`;
const URL_B = 'https://eu5.bookingkit.de/cart/set/0f1e2d3c4b5a69788796a5b4c3d2e1f0?utm_source=web_chat';
const CARD_WORDS = '2 Tickets · Lantern Walk on the Old Wall, Burg Beispielstein: Tickets buchen';
const cards: CheckoutCardData[] = [{
  url: URL_A, locale: 'de', bookings: [{ count: 2, unit: 'person', product: 'Lantern Walk on the Old Wall' }],
}];

/** The answer as the screen shows it, and as the status region says it. */
function screenAndSpeech(markdown: string) {
  const registry = new CardSpeechRegistry();
  const { unmount } = render(
    <CheckoutCardsContext.Provider value={{ cards, language: 'en', venue: 'Burg Beispielstein' }}>
      <CardSpeechContext.Provider value={registry}>
        <ChatMessage message={markdown} isSend={false} message_id="answer" host_url="http://localhost:3000" streaming={false} />
      </CardSpeechContext.Provider>
    </CheckoutCardsContext.Provider>,
  );
  const shown = Array.from(document.querySelectorAll('.cl-checkout-card')).map((card) => {
    const title = card.querySelector('.cl-checkout-card-title')!.textContent;
    const venue = card.querySelector('.cl-checkout-card-meta')!.textContent;
    const label = card.querySelector('.cl-checkout-card-button')!.textContent;
    return `${title}, ${venue}: ${label}`;
  });
  const reported = registry.get('answer');
  const spoken = markdownToPlainText(speakCheckoutCards(markdown, reported));
  unmount();
  return { shown, reported, spoken };
}

/**
 * The spoken text holds the words of each card on screen, and nothing of the
 * link it replaces: no link text, no URL, no bold marks. Without a card, it
 * is the plain text of the answer.
 */
function expectSpeechFollowsScreen(markdown: string) {
  const { shown, reported, spoken } = screenAndSpeech(markdown);
  expect(reported).toHaveLength(shown.length);
  for (const words of shown) expect(spoken).toContain(words);
  if (shown.length > 0) expect(spoken).not.toMatch(/Jetzt|sichern|https?:\/\/|\*\*|kasse/);
  else expect(spoken).toBe(markdownToPlainText(markdown));
  return shown.length;
}

const lead = 'Am Samstag sind noch Plätze frei.';

describe('the status region says what the screen shows', () => {
  it.each([
    ['the agent format', `**[Jetzt sichern](${URL_A})**`],
    ['emoji around the link', `👉 **[Jetzt sichern](${URL_A})** 🎟️`],
    ['a link with a title', `[Jetzt sichern](${URL_A} "Warenkorb")`],
    ['a bare URL', URL_A],
    ['a bold bare URL', `**${URL_A}**`],
    ['an autolink', `<${URL_A}>`],
    ['a paragraph of two lines', `👉\n**[Jetzt sichern](${URL_A})**`],
    ['a heading above', `## Termine\n**[Jetzt sichern](${URL_A})**`],
    ['a rule above', `---\n**[Jetzt sichern](${URL_A})**`],
    ['a list below', `**[Jetzt sichern](${URL_A})**\n- Mehr Infos`],
    ['a quote below', `**[Jetzt sichern](${URL_A})**\n> Hinweis`],
    ['a paragraph after a list and a blank line', `- Samstag\n\n**[Jetzt sichern](${URL_A})**`],
    ['three spaces before the link', `   **[Jetzt sichern](${URL_A})**`],
    ['an emoji inside the bold', `**👉 [Jetzt sichern](${URL_A})**`],
    ['a backslash escape in the URL', `[Jetzt sichern](${URL_A.replace('utm_source', 'utm\\_source')})`],
    ['an entity in the URL', `[Jetzt sichern](${URL_A.replace('&utm_source', '&amp;utm_source')})`],
    ['a reference link', `[Jetzt sichern][kasse]\n\n[kasse]: ${URL_A}`],
    ['brackets in the link text', `**[Jetzt [2 Tickets] sichern](${URL_A})**`],
    ['Windows line ends', `${lead}\r\n\r\n**[Jetzt sichern](${URL_A})**\r\n\r\nBis bald!`],
    ['a code block with blank lines above', `\`\`\`\ncode\n\nmore code\n\`\`\`\n\n**[Jetzt sichern](${URL_A})**`],
    // The link on the line under a lead-in, in the same paragraph.
    ['a lead-in line above (soft break)', `Hier entlang:\n**[Jetzt sichern](${URL_A})**`],
    ['a lead-in line above (hard break)', `Hier entlang:  \n👉 **[Jetzt sichern](${URL_A})**`],
    ['a lead-in line above (backslash break)', `Hier entlang:\\\n**[Jetzt sichern](${URL_A})**`],
    ['a lead-in line and an emoji line above', `Hier entlang:\n👉\n**[Jetzt sichern](${URL_A})** 🎟️`],
    ['two lead-in lines above', `Zwei Plätze sind frei.\nHier entlang:\n**[Jetzt sichern](${URL_A})**`],
    ['a lead-in line above, Windows line ends', `Hier entlang:\r\n**[Jetzt sichern](${URL_A})**`],
    ['a lead-in line with a link above', `Erst [die Preise](https://example.com/preise):\n**[Jetzt sichern](${URL_A})**`],
    ['a lead-in line with an entity above', `Hier &amp; jetzt:\n**[Jetzt sichern](${URL_A})**`],
    ['an emoji line above, after a hard break', `👉  \n**[Jetzt sichern](${URL_A})**`],
    ['a lead-in line, an emoji line and hard breaks', `Hier entlang:  \n👉  \n**[Jetzt sichern](${URL_A})**`],
  ])('shows and says a card for %s', (_, link) => {
    expect(expectSpeechFollowsScreen(`${lead}\n\n${link}\n\nBis bald!`)).toBe(1);
  });

  it.each([
    ['text next to the link', `Hier buchen: **[Jetzt sichern](${URL_A})**`],
    ['a list item', `- **[Jetzt sichern](${URL_A})**`],
    ['a list item with a star', `* **[Jetzt sichern](${URL_A})**`],
    ['a list item with a plus', `+ [Jetzt sichern](${URL_A})`],
    ['a numbered list item', `1. **[Jetzt sichern](${URL_A})**`],
    ['a paragraph inside a list item', `- Samstag\n\n  **[Jetzt sichern](${URL_A})**`],
    ['indented code', `    ${URL_A}`],
    ['fenced code', `\`\`\`\n\n**[Jetzt sichern](${URL_A})**\n\n\`\`\``],
    ['a quote', `> **[Jetzt sichern](${URL_A})**`],
    ['a heading', `## [Jetzt sichern](${URL_A})`],
    ['a link and a bare URL', `[Jetzt sichern](${URL_A}) ${URL_B}`],
    ['an emoji line above a star list item', `👉\n* **[Jetzt sichern](${URL_A})**`],
    ['a heading underline below (setext)', `**[Jetzt sichern](${URL_A})**\n---`],
    ['a lazy line of a quote', `> Hinweis\n**[Jetzt sichern](${URL_A})**`],
    ['a lazy line of a list item', `- Samstag\n**[Jetzt sichern](${URL_A})**`],
    ['bold and italics around the link', `***[Jetzt sichern](${URL_A})***`],
    ['an ordered item that continues a paragraph', `Termine\n2. **[Jetzt sichern](${URL_A})**`],
    ['a fence with an info string inside a fence', `\`\`\`\n\`\`\`js\n**[Jetzt sichern](${URL_A})**\n\`\`\``],
    ['two links', `[Jetzt sichern](${URL_A}) [Gutschein](${URL_B})`],
    // Emoji count as letters for bold: the stars stay text, no bold forms.
    ['an emoji right before the bold', `👉**[Jetzt sichern](${URL_A})**`],
    ['an emoji right after the bold', `**[Jetzt sichern](${URL_A})**👈`],
    ['spaces inside the bold', `** [Jetzt sichern](${URL_A}) **`],
    ['a card for another link', `**[Jetzt sichern](${URL_B})**`],
    ['a lead-in line above and text after the link', `Hier entlang:\n**[Jetzt sichern](${URL_A})** für zwei.`],
    ['text on the line under the link', `**[Jetzt sichern](${URL_A})**\nfür zwei Personen.`],
  ])('shows and says no card for %s', (_, link) => {
    expect(expectSpeechFollowsScreen(`${lead}\n\n${link}\n\nBis bald!`)).toBe(0);
  });

  // Where Markdown itself decides in subtle ways, the test asks only that
  // the spoken text follows the screen, card or not.
  it.each([
    ['an ordered item, a blank line, then the link indented 2 spaces', `1. Samstag\n\n  **[Jetzt sichern](${URL_A})**`],
    ['a bullet item, a blank line, then the link indented 2 spaces', `- Samstag\n\n  **[Jetzt sichern](${URL_A})**`],
    ['a table under the link line', `**[Jetzt sichern](${URL_A})**\n| Tag | Zeit |\n| --- | --- |\n| Sa | 18:00 |`],
    ['an HTML block under the link line', `**[Jetzt sichern](${URL_A})**\n<div>Hinweis</div>`],
    ['a rule that also reads as a bullet', `**[Jetzt sichern](${URL_A})**\n* * *`],
    ['a lazy line under a list item and a quote', `- Samstag\n> Hinweis\n**[Jetzt sichern](${URL_A})**`],
    ['the link as the only text', `**[Jetzt sichern](${URL_A})**`],
    ['a lead-in line, the card link and a link without a card', `Hier entlang:\n**[Jetzt sichern](${URL_A})**\n**[Gutschein](${URL_B})**`],
    ['the link line as the last line of the answer', `${lead}\nHier entlang:\n**[Jetzt sichern](${URL_A})**`],
  ])('says what the screen shows for %s', (_, markdown) => {
    expectSpeechFollowsScreen(markdown);
  });

  it('says two cards in one answer, each in its place', () => {
    const second: CheckoutCardData = {
      url: URL_B, locale: 'de', bookings: [{ count: 4, unit: 'group', product: 'Kayak at sunset' }],
    };
    cards.push(second);
    try {
      const { shown, spoken } = screenAndSpeech(`**[Samstag](${URL_A})**\n\nOder am Sonntag:\n\n**[Sonntag](${URL_B})**`);
      expect(shown).toEqual([CARD_WORDS, '4 Personen · Kayak at sunset, Burg Beispielstein: Jetzt buchen']);
      expect(spoken).toBe(`${CARD_WORDS}\n\nOder am Sonntag:\n\n4 Personen · Kayak at sunset, Burg Beispielstein: Jetzt buchen`);
    } finally {
      cards.pop();
    }
  });

  it('says a reference link card without its definition', () => {
    expect(screenAndSpeech(`${lead}\n\n**[Jetzt sichern][kasse]**\n\n[kasse]: ${URL_A}\n\nBis bald!`).spoken)
      .toBe(`${lead}\n\n${CARD_WORDS}\n\nBis bald!`);
  });

  it('says the lead-in line and the card words in place of the link line', () => {
    expect(screenAndSpeech(`${lead}\n\nHier entlang:  \n👉 **[Jetzt sichern](${URL_A})**\n\nBis bald!`).spoken)
      .toBe(`${lead}\n\nHier entlang:\n${CARD_WORDS}\n\nBis bald!`);
  });

  it('says the card words in place of the link, and keeps the text around it', () => {
    expect(screenAndSpeech(`${lead}\n\n**[Jetzt sichern](${URL_A})**\n\nBis bald!`).spoken)
      .toBe(`${lead}\n\n${CARD_WORDS}\n\nBis bald!`);
  });
});
