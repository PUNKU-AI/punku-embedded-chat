import { AnchorHTMLAttributes, useLayoutEffect, useRef } from "react";
import { getBookingkitCheckoutUrl } from "../bookingkitCheckout";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  onCheckout?: (url: string, opener: HTMLAnchorElement) => boolean;
};

type NitroClick = MouseEvent & {
  nitroPromise?: unknown;
  nitroDefaultPrevented?: boolean;
};

export default function BookingkitCheckoutLink({ onCheckout, href, children, ...props }: Props) {
  const ref = useRef<HTMLAnchorElement>(null);
  useLayoutEffect(() => {
    const anchor = ref.current;
    const checkoutUrl = getBookingkitCheckoutUrl(href);
    if (!anchor || !checkoutUrl || !onCheckout) return;

    const handleClick = (event: Event) => {
      const click = event as NitroClick;
      if (
        click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey ||
        (click.defaultPrevented && !(click.nitroPromise && click.nitroDefaultPrevented === false))
      ) return;
      if (!onCheckout(checkoutUrl, anchor)) return;
      click.preventDefault();
      // NitroPack replaces preventDefault(). Also cancel the native navigation.
      Event.prototype.preventDefault.call(click);
    };

    // NitroPack patches HTMLElement.addEventListener and defers React handlers.
    // A native anchor listener retains the link's identity inside a closed root.
    EventTarget.prototype.addEventListener.call(anchor, "click", handleClick, true);
    return () => {
      EventTarget.prototype.removeEventListener.call(anchor, "click", handleClick, true);
    };
  }, [href, onCheckout]);

  return <a {...props} ref={ref} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}
