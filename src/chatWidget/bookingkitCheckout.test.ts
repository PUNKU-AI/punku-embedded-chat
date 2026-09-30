import { getBookingkitCheckoutUrl, openNativeBookingkitCheckout } from "./bookingkitCheckout";

const checkout = "https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?c=%5B%5D&utm_source=web_chat&sale_params%5Bsource%5D=web_chat&pk_currency=EUR";
const bkWindow = window as Window & { bookingkitServices?: unknown };

afterEach(() => { delete bkWindow.bookingkitServices; });

it("preserves the complete cart URL and its encoded attribution parameters", () => {
  expect(getBookingkitCheckoutUrl(checkout)).toBe(checkout);
});

it.each([
  "https://eu5.bookingkit.de.evil.example/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat",
  "https://eu5.bookingkit.de@evil.example/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat",
  "https://user:password@eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat",
  checkout.replace("https:", "http:"),
  checkout.replace("utm_source=web_chat", "utm_source=other"),
  checkout.replace("/cart/set/", "/checkout2/terms/"),
  checkout.replace("0123456789abcdef0123456789abcdef", "not-a-vendor"),
  "/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat",
  // eslint-disable-next-line no-script-url -- Verify that script URLs cannot become checkout frames.
  "javascript:alert(1)",
  undefined,
])("does not turn an unsupported link into an embedded checkout: %s", (url) => {
  expect(getBookingkitCheckoutUrl(url)).toBeNull();
});

it("opens the existing native modal only when Bookingkit resolves a usable host", () => {
  const openCheckout = jest.fn();
  const resolveCheckoutHost = jest.fn<unknown, []>(() => ({ hostElement: document.body }));
  bkWindow.bookingkitServices = { widgetOrchestrator: { openCheckout, resolveCheckoutHost } };
  expect(openNativeBookingkitCheckout(checkout)).toBe(true);
  expect(openCheckout).toHaveBeenCalledTimes(1);
  expect(openCheckout).toHaveBeenCalledWith(checkout);
  resolveCheckoutHost.mockReturnValue(undefined);
  expect(openNativeBookingkitCheckout(checkout)).toBe(false);
  expect(openCheckout).toHaveBeenCalledTimes(1);
});

it("allows our dialog when the optional API is missing, incomplete, or throws", () => {
  expect(openNativeBookingkitCheckout(checkout)).toBe(false);
  bkWindow.bookingkitServices = { widgetOrchestrator: { openCheckout: jest.fn() } };
  expect(openNativeBookingkitCheckout(checkout)).toBe(false);
  bkWindow.bookingkitServices = { widgetOrchestrator: {
    resolveCheckoutHost: () => document.body,
    openCheckout: () => { throw new Error("Widget unavailable"); },
  } };
  expect(openNativeBookingkitCheckout(checkout)).toBe(false);
});
