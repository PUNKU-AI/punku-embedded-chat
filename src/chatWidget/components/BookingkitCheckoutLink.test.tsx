import { render, screen, within } from "@testing-library/react";
import BookingkitCheckoutLink from "./BookingkitCheckoutLink";

const checkout = "https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat&c=%5B%5D";

it("opens checkout inside a closed shadow root and cancels the tab navigation", () => {
  const host = document.createElement("punku-chat");
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "closed" });
  const onCheckout = jest.fn(() => true);
  const view = render(<BookingkitCheckoutLink href={checkout} onCheckout={onCheckout}>Book</BookingkitCheckoutLink>, { container: root as unknown as HTMLElement });
  const anchor = within(root as unknown as HTMLElement).getByRole("link");
  const click = new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, button: 0 });
  anchor.dispatchEvent(click);
  expect(onCheckout).toHaveBeenCalledWith(checkout);
  expect(click.defaultPrevented).toBe(true);
  expect(host.shadowRoot).toBeNull();
  view.unmount();
  host.remove();
});

it("handles a NitroPack-canceled click even when HTMLElement listeners are deferred", () => {
  const original = HTMLElement.prototype.addEventListener;
  HTMLElement.prototype.addEventListener = jest.fn();
  const onCheckout = jest.fn(() => true);
  try {
    render(<BookingkitCheckoutLink href={checkout} onCheckout={onCheckout}>Book</BookingkitCheckoutLink>);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    click.preventDefault();
    Object.assign(click, { nitroPromise: Promise.resolve(), nitroDefaultPrevented: false });
    screen.getByRole("link").dispatchEvent(click);
    expect(onCheckout).toHaveBeenCalledTimes(1);
  } finally {
    HTMLElement.prototype.addEventListener = original;
  }
});

it("does not open a second modal after a document interceptor handles the link", () => {
  const onCheckout = jest.fn(() => true);
  render(<BookingkitCheckoutLink href={checkout} onCheckout={onCheckout}>Book</BookingkitCheckoutLink>);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  click.preventDefault();
  screen.getByRole("link").dispatchEvent(click);
  expect(onCheckout).not.toHaveBeenCalled();
});

it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])("preserves modified or middle clicks: %j", (options) => {
  const onCheckout = jest.fn(() => true);
  render(<BookingkitCheckoutLink href={checkout} onCheckout={onCheckout}>Book</BookingkitCheckoutLink>);
  const anchor = screen.getByRole("link");
  // Remove href only for this dispatch, so jsdom cannot attempt browser navigation.
  anchor.removeAttribute("href");
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...options });
  anchor.dispatchEvent(click);
  expect(onCheckout).not.toHaveBeenCalled();
  expect(click.defaultPrevented).toBe(false);
});

it("keeps ordinary links as normal new-tab anchors", () => {
  const onCheckout = jest.fn(() => true);
  render(<BookingkitCheckoutLink href="https://example.com/" onCheckout={onCheckout}>Info</BookingkitCheckoutLink>);
  expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.com/");
  expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
});
