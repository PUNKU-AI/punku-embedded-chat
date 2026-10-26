import { createContext, HTMLAttributes, ReactNode, useContext, useId } from "react";
import type { Language } from "../../translations";
import { CheckoutCardData, findCheckoutCard, formatCheckoutCard } from "../checkoutCards";
import BookingkitCheckoutLink from "./BookingkitCheckoutLink";

/** What the answers need for checkout cards: the cards of the conversation, the chat language and the venue line. */
export type CheckoutCards = {
  cards: CheckoutCardData[];
  language: Language;
  /** The second line of each card, for example the name of the venue (checkout_card_venue). */
  venue?: string;
};

export const CheckoutCardsContext = createContext<CheckoutCards>({ cards: [], language: "en" });

/** True while the answer around it still streams in (ChatMessage). */
export const AnswerStreamingContext = createContext(false);

type OnCheckout = (url: string, opener: HTMLAnchorElement) => boolean;

/**
 * A checkout link as a card: the bold title ("2 Tickets · Experience"), the
 * venue on the second line, and the link as a full-width button with the
 * widget's own label. The card is not a link and not a button. Its only
 * interactive element is the checkout anchor (BookingkitCheckoutLink), so the
 * on-page checkout, NitroPack recovery and focus return work as for every
 * checkout link. The anchor's name is the label; the title and the venue
 * describe it.
 */
export default function CheckoutCard({ title, venue, label, href, onCheckout }: {
  title: string;
  venue?: string;
  label: string;
  href: string;
  onCheckout?: OnCheckout;
}) {
  const id = useId();
  const titleId = `${id}title`;
  const venueId = `${id}venue`;
  return (
    <div className="cl-checkout-card">
      <div className="cl-checkout-card-title" id={titleId}>{title}</div>
      {venue ? <div className="cl-checkout-card-meta" id={venueId}>{venue}</div> : null}
      <BookingkitCheckoutLink
        href={href}
        onCheckout={onCheckout}
        className="cl-checkout-card-button"
        aria-describedby={venue ? `${titleId} ${venueId}` : titleId}
      >
        {label}
      </BookingkitCheckoutLink>
    </div>
  );
}

/**
 * A paragraph at the top level of an answer. It is a checkout card when it
 * holds only a checkout link (`href`), the server sent a card for that link,
 * and the paragraph is complete: a later block follows it, or the answer has
 * stopped streaming. Else it is the paragraph as before: the filled link
 * button (cl-link-only) when it holds only a link. Every top-level paragraph
 * renders through this one component, so a paragraph that changes between
 * these cases while it streams keeps its element and its link. The cards
 * and the language come from a context: a new card or a new language never
 * rebuilds the Markdown components, so an open checkout keeps its opener.
 */
export function AnswerParagraph({ href, linkOnly, followed, onCheckout, children, ...props }: HTMLAttributes<HTMLParagraphElement> & {
  /** The checkout link when the paragraph holds only that link, else null. */
  href: string | null;
  /** True when the paragraph holds only a link (any link). */
  linkOnly: boolean;
  /** True when a later block follows the paragraph in the answer. */
  followed: boolean;
  onCheckout?: OnCheckout;
  children?: ReactNode;
}) {
  const { cards, language, venue } = useContext(CheckoutCardsContext);
  const streaming = useContext(AnswerStreamingContext);
  const card = href && (followed || !streaming) ? findCheckoutCard(cards, href) : null;
  const view = card && formatCheckoutCard(card, language);
  if (href && view) {
    return <CheckoutCard title={view.title} venue={venue} label={view.label} href={href} onCheckout={onCheckout} />;
  }
  return <p {...props} className={linkOnly ? "cl-link-only" : undefined}>{children}</p>;
}
