import { fireEvent, render, screen } from "@testing-library/react";
import ChatWidget from "./index";

const url = "https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat&c=%5B%5D";
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: jest.fn() });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function () { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function () { this.removeAttribute("open"); },
  });
});
afterAll(() => {
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});
beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

it("opens checkout through a real Markdown message and keeps the chat open on Escape", () => {
  render(<ChatWidget flow_id="test-flow" input_value="" input_type="chat" output_type="chat" start_open default_language="en" welcome_message={`[Book tickets](${url})`} />);
  fireEvent.click(screen.getByRole("link", { name: "Book tickets" }));
  const dialog = screen.getByRole("dialog", { name: "Checkout" });
  expect(screen.getByTitle("Checkout")).toHaveAttribute("src", url);
  // The page key listener must not close the chat behind the modal.
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText("Type your message...")).toBeVisible();
});

it.each(["Escape", "close button", "checkout message"])(
  "returns keyboard focus to the booking link after %s, including repeated opens",
  (closeMethod) => {
    render(<ChatWidget flow_id="test-flow" input_value="" input_type="chat" output_type="chat" start_open default_language="en" welcome_message={`[Book tickets](${url})`} />);
    // Pointer activation need not focus the anchor before it opens checkout.
    screen.getByPlaceholderText("Type your message...").focus();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.click(screen.getByRole("link", { name: "Book tickets" }));
      expect(screen.getByRole("button", { name: "Close checkout" })).toHaveFocus();

      if (closeMethod === "Escape") {
        fireEvent.keyDown(document, { key: "Escape" });
        fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
      } else if (closeMethod === "close button") {
        fireEvent.click(screen.getByRole("button", { name: "Close checkout" }));
      } else {
        const frame = screen.getByTitle("Checkout") as HTMLIFrameElement;
        fireEvent(window, new MessageEvent("message", {
          origin: "https://eu5.bookingkit.de",
          source: frame.contentWindow,
          data: { action: "closeLightbox" },
        }));
      }

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText("Type your message...")).toBeVisible();
      expect(screen.getByRole("link", { name: "Book tickets" })).toHaveFocus();
    }
  }
);
