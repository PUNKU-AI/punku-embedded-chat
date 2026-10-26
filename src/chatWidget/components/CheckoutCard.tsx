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
 * A top-level paragraph that holds only a checkout link: a checkout card when
 * the server sent a card for that link, else the filled link button
 * (p.cl-link-only). The cards come from the context, so a new card or a new
 * language never rebuilds the Markdown components: an open checkout keeps
 * its opener.
 */
export function CheckoutLinkParagraph({ href, onCheckout, children, ...props }: HTMLAttributes<HTMLParagraphElement> & {
  href: string;
  onCheckout?: OnCheckout;
  children?: ReactNode;
}) {
  const { cards, language, venue } = useContext(CheckoutCardsContext);
  const card = findCheckoutCard(cards, href);
  const view = card && formatCheckoutCard(card, language);
  if (view) {
    return <CheckoutCard title={view.title} venue={venue} label={view.label} href={href} onCheckout={onCheckout} />;
  }
  return <p {...props} className="cl-link-only">{children}</p>;
}
