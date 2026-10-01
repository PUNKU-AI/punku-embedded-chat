import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import BookingkitCheckoutModal from "./BookingkitCheckoutModal";

const checkoutUrl = "https://eu5.bookingkit.de/cart/set/vendor?c=%5B%7B%22amount%22%3A2%7D%5D&utm_source=web_chat&utm_medium=chat_widget";
const checkoutOrigin = "https://eu5.bookingkit.de";
const closeMessage = { action: "closeLightbox", params: [] };
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

const showModal = jest.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
const closeDialog = jest.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
});

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: closeDialog });
});

afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});

beforeEach(() => {
  jest.clearAllMocks();
  showModal.mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  closeDialog.mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});

function sendMessage(data: unknown, source: Window | null, origin = checkoutOrigin) {
  fireEvent(window, new MessageEvent("message", { data, source, origin }));
}

describe("BookingkitCheckoutModal", () => {
  it("renders nothing when there is no checkout URL", () => {
    const { container } = render(<BookingkitCheckoutModal url={null} onClose={jest.fn()} language="en" />);
    expect(container).toBeEmptyDOMElement();
    expect(showModal).not.toHaveBeenCalled();
  });

  it("opens a native dialog and preserves the exact iframe and fallback URLs", () => {
    render(<BookingkitCheckoutModal url={checkoutUrl} onClose={jest.fn()} language="en" />);
    expect(showModal).toHaveBeenCalledTimes(1);
    const frame = screen.getByTitle("Checkout");
    expect(frame).toHaveAttribute("src", checkoutUrl);
    expect(frame).toHaveAttribute("allow", "payment");
    expect(frame).not.toHaveAttribute("sandbox");
    const externalLink = screen.getByRole("link", { name: "Open in new tab" });
    expect(externalLink).toHaveAttribute("href", checkoutUrl);
    expect(externalLink).toHaveAttribute("target", "_blank");
    expect(externalLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("button", { name: "Close checkout" })).toHaveFocus();
  });

  it("shows German controls", () => {
    render(<BookingkitCheckoutModal url={checkoutUrl} onClose={jest.fn()} language="de" />);
    expect(screen.getByRole("dialog", { name: "Buchung" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "In neuem Tab öffnen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buchung schließen" })).toBeInTheDocument();
  });

  it("closes from its native close button and avoids a second callback during cleanup", () => {
    const onClose = jest.fn();
    const { rerender } = render(<BookingkitCheckoutModal url={checkoutUrl} onClose={onClose} language="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Close checkout" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<BookingkitCheckoutModal url={null} onClose={onClose} language="en" />);
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handles native Escape cancellation once", () => {
    const onClose = jest.fn();
    render(<BookingkitCheckoutModal url={checkoutUrl} onClose={onClose} language="en" />);
    const event = new Event("cancel", { cancelable: true });
    fireEvent(screen.getByRole("dialog"), event);
    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handles an external native dialog close", () => {
    const onClose = jest.fn();
    render(<BookingkitCheckoutModal url={checkoutUrl} onClose={onClose} language="en" />);
    (screen.getByRole("dialog") as HTMLDialogElement).close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("accepts a close action only from the active checkout iframe and exact origin", () => {
    const onClose = jest.fn();
    render(<BookingkitCheckoutModal url={checkoutUrl} onClose={onClose} language="en" />);
    const frame = screen.getByTitle("Checkout") as HTMLIFrameElement;
    sendMessage(closeMessage, frame.contentWindow, "https://eu5.bookingkit.de.attacker.example");
    sendMessage(closeMessage, frame.contentWindow, "http://eu5.bookingkit.de");
    sendMessage(closeMessage, window);
    sendMessage(closeMessage, null);
    sendMessage("closeLightbox", frame.contentWindow);
    sendMessage({ action: "resizeLightbox", params: [] }, frame.contentWindow);
    sendMessage(null, frame.contentWindow);
    expect(onClose).not.toHaveBeenCalled();
    sendMessage(closeMessage, frame.contentWindow);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to an opener inside a closed shadow root", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: "closed" });
    const opener = document.createElement("button");
    opener.textContent = "Open checkout";
    shadowRoot.appendChild(opener);
    const container = document.createElement("div");
    shadowRoot.appendChild(container);
    opener.focus();
    const { rerender, unmount } = render(
      <BookingkitCheckoutModal url={checkoutUrl} onClose={jest.fn()} language="en" />,
      { container },
    );
    // eslint-disable-next-line testing-library/no-node-access -- Document focus stops at a closed shadow host.
    expect(shadowRoot.activeElement).not.toBe(opener);
    rerender(<BookingkitCheckoutModal url={null} onClose={jest.fn()} language="en" />);
    // eslint-disable-next-line testing-library/no-node-access -- Inspect focus inside the closed root.
    expect(shadowRoot.activeElement).toBe(opener);
    unmount();
    host.remove();
  });

  it("opens the explicit fallback during the click even when the host cancels navigation", () => {
    const openWindow = jest.spyOn(window, "open").mockReturnValue(null);
    const cancelNavigation = (event: Event) => event.preventDefault();
    document.addEventListener("click", cancelNavigation, true);
    try {
      render(<BookingkitCheckoutModal url={checkoutUrl} onClose={jest.fn()} language="en" />);
      fireEvent.click(screen.getByRole("link", { name: "Open in new tab" }));
      expect(openWindow).toHaveBeenCalledWith(checkoutUrl, "_blank", "noopener,noreferrer");
    } finally {
      document.removeEventListener("click", cancelNavigation, true);
      openWindow.mockRestore();
    }
  });

  it("leaves modifier clicks on the explicit fallback link to the browser", () => {
    const openWindow = jest.spyOn(window, "open").mockReturnValue(null);
    try {
      render(<BookingkitCheckoutModal url={checkoutUrl} onClose={jest.fn()} language="en" />);
      const link = screen.getByRole("link", { name: "Open in new tab" });
      fireEvent.click(link, { ctrlKey: true });
      fireEvent.click(link, { metaKey: true });
      fireEvent.click(link, { shiftKey: true });
      fireEvent.click(link, { altKey: true });
      fireEvent.click(link, { button: 1 });
      expect(openWindow).not.toHaveBeenCalled();
    } finally {
      openWindow.mockRestore();
    }
  });

  it("removes the checkout message listener on unmount", () => {
    const onClose = jest.fn();
    const { unmount } = render(<BookingkitCheckoutModal url={checkoutUrl} onClose={onClose} language="en" />);
    const frameWindow = (screen.getByTitle("Checkout") as HTMLIFrameElement).contentWindow;
    unmount();
    sendMessage(closeMessage, frameWindow);
    expect(onClose).not.toHaveBeenCalled();
  });
});
