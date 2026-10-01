const BOOKINGKIT_ORIGIN = "https://eu5.bookingkit.de";

/** Match only the cart links returned by the Bookingkit checkout tool. */
export function getBookingkitCheckoutUrl(href?: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    if (
      url.origin !== BOOKINGKIT_ORIGIN ||
      url.username || url.password ||
      !/^\/cart\/set\/[a-f0-9]{32}\/?$/i.test(url.pathname) ||
      url.searchParams.get("utm_source") !== "web_chat"
    ) return null;
    // Preserve the original cart, attribution, and quoted-price parameters.
    return href;
  } catch {
    return null;
  }
}

type BookingkitOrchestrator = {
  resolveCheckoutHost: () => unknown;
  openCheckout: (url: string) => void;
};

/** Use Bookingkit's own modal when its installed widget exposes this API. */
export function openNativeBookingkitCheckout(url: string): boolean {
  if (!getBookingkitCheckoutUrl(url)) return false;
  const services = (window as Window & {
    bookingkitServices?: { widgetOrchestrator?: Partial<BookingkitOrchestrator> };
  }).bookingkitServices;
  const orchestrator = services?.widgetOrchestrator;
  if (
    typeof orchestrator?.resolveCheckoutHost !== "function" ||
    typeof orchestrator.openCheckout !== "function"
  ) return false;
  try {
    if (!orchestrator.resolveCheckoutHost()) return false;
    orchestrator.openCheckout(url);
    return true;
  } catch {
    // This optional API is supplied by the host page. Use our dialog on failure.
    return false;
  }
}
