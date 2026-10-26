import { act, fireEvent, render, screen } from "@testing-library/react";
import ChatWidget from "./index";
import { streamMessage } from "../controllers";

// The answer streams from a mock: the test sends its events.
jest.mock("../controllers", () => ({ ...jest.requireActual("../controllers"), streamMessage: jest.fn() }));

const url = "https://eu5.bookingkit.de/cart/set/0123456789abcdef0123456789abcdef?utm_source=web_chat&c=%5B%5D";
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTo");

beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, value: jest.fn() });
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
  if (originalScroll) Object.defineProperty(Element.prototype, "scrollTo", originalScroll);
  else delete (Element.prototype as Partial<Element>).scrollTo;
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

// The agent writes **[Book tickets](url)**: bold around the link. Both forms
// render as the filled link button and open the on-page checkout.
describe.each([
  ["the agent format", `**[Book tickets](${url})**`],
  ["bold inside the link", `[**Book tickets**](${url})`],
  ["a plain link", `[Book tickets](${url})`],
])("checkout link in %s", (_, message) => {
  it("opens checkout through a real Markdown message and keeps the chat open on Escape", () => {
    render(<ChatWidget flow_id="test-flow" input_value="" input_type="chat" output_type="chat" start_open default_language="en" welcome_message={message} />);
    const link = screen.getByRole("link", { name: "Book tickets" });
    expect(link.closest("p")).toHaveClass("cl-link-only");
    fireEvent.click(link);
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
      render(<ChatWidget flow_id="test-flow" input_value="" input_type="chat" output_type="chat" start_open default_language="en" welcome_message={message} />);
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
});

// An answer with a checkout card, restored from the visitor's session after a
// page load. Made-up cart, experience and venue: the repository is public.
describe("checkout card", () => {
  const cardUrl = "https://eu5.bookingkit.de/cart/set/fedcba9876543210fedcba9876543210?utm_source=web_chat&c=[{\"q\":2}]";
  const storeConversation = (locale: string | null, streaming = false) => {
    const now = Date.now();
    localStorage.setItem("punku-chat-session-localhost-test-flow", JSON.stringify({
      sessionId: "stored-session", createdAt: now, lastActiveAt: now, expiresAt: now + 60 * 60 * 1000,
      domain: "localhost", flowId: "test-flow",
      messages: [
        { message: "Do you have places for two at sunset?", isSend: true },
        {
          message: `Yes, two places are free.\n\n👉 **[Grab your spot](${cardUrl})**`, isSend: false, message_id: "stored-answer",
          streaming,
          checkoutCards: [{ url: cardUrl, locale, bookings: [{ count: 2, unit: "person", product: "Kayak at sunset" }] }],
        },
      ],
    }));
  };
  const renderWidget = () => render(
    <ChatWidget flow_id="test-flow" input_value="" input_type="chat" output_type="chat" start_open default_language="en"
      checkout_card_venue="Lakeside Boathouse" />
  );

  it("shows the card after a page load, opens checkout and returns focus to the same button", () => {
    storeConversation(null);
    renderWidget();

    expect(document.querySelector(".cl-checkout-card-title")).toHaveTextContent("2 tickets · Kayak at sunset");
    expect(document.querySelector(".cl-checkout-card-meta")).toHaveTextContent("Lakeside Boathouse");
    const button = screen.getByRole("link", { name: "Book tickets" });
    screen.getByPlaceholderText("Type your message...").focus();

    for (const close of ["Escape", "close button"]) {
      fireEvent.click(button);
      expect(screen.getByRole("dialog", { name: "Checkout" })).toBeInTheDocument();
      // The checkout opens the link of the answer, as Markdown wrote it.
      expect(screen.getByTitle("Checkout")).toHaveAttribute("src", button.getAttribute("href"));
      expect(screen.getByRole("button", { name: "Close checkout" })).toHaveFocus();
      if (close === "Escape") {
        fireEvent.keyDown(document, { key: "Escape" });
        fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
      } else {
        fireEvent.click(screen.getByRole("button", { name: "Close checkout" }));
      }
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // The same button: the open checkout does not replace it.
      expect(screen.getByRole("link", { name: "Book tickets" })).toBe(button);
      expect(button).toHaveFocus();
    }
  });

  it("shows the card of an answer that was saved while it streamed", () => {
    // The page reloaded mid-stream: the saved answer still says streaming.
    storeConversation(null, true);
    renderWidget();

    expect(screen.getByRole("link", { name: "Book tickets" })).toHaveClass("cl-checkout-card-button");
  });

  it("returns focus to the card button when the card replaces the opener during the checkout", () => {
    const events: { push: (data: unknown) => void; end: () => void } = { push: () => {}, end: () => {} };
    (streamMessage as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
      events.push = args[10] as (data: unknown) => void;
      events.end = () => (args[11] as (terminal: string) => void)("end");
      return Promise.resolve();
    });
    const blocks = [{
      title: "Checkout",
      contents: [{
        type: "json",
        data: {
          kind: "punku.checkout_card", v: 1, url: cardUrl, locale: null,
          bookings: [{ count: 2, unit: "person", product: "Kayak at sunset" }],
        },
      }],
    }];
    const answer = (text: string) => events.push({
      event: "add_message", data: { sender: "Machine", id: "live-answer", text, content_blocks: blocks },
    });
    renderWidget();
    const input = screen.getByPlaceholderText("Type your message...");
    fireEvent.change(input, { target: { value: "Two places at sunset?" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    // The link is the last block while the answer streams: the link button.
    act(() => answer(""));
    act(() => answer(`Yes, two places are free.\n\n**[Grab your spot](${cardUrl})**`));
    const opener = screen.getByRole("link", { name: "Grab your spot" });
    expect(opener.closest("p")).toHaveClass("cl-link-only");
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Checkout" })).toBeInTheDocument();

    // The stream ends while the checkout is open: the card replaces the button.
    act(() => {
      events.push({ event: "end", data: { result: {} } });
      events.end();
    });
    const cardButton = screen.getByRole("link", { name: "Book tickets" });
    expect(opener.isConnected).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Close checkout" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cardButton).toHaveFocus();
  });

  it("tells screen readers the card of a streamed answer as the screen shows it", () => {
    let push: (data: unknown) => void = () => {};
    let end = () => {};
    (streamMessage as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
      push = args[10] as (data: unknown) => void;
      end = () => (args[11] as (terminal: string) => void)("end");
      return Promise.resolve();
    });
    const blocks = [{
      title: "Checkout",
      contents: [{
        type: "json",
        data: {
          kind: "punku.checkout_card", v: 1, url: cardUrl, locale: null,
          bookings: [{ count: 2, unit: "person", product: "Kayak at sunset" }],
        },
      }],
    }];
    renderWidget();
    const input = screen.getByPlaceholderText("Type your message...");
    fireEvent.change(input, { target: { value: "Two places at sunset?" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    act(() => {
      push({ event: "add_message", data: { sender: "Machine", id: "spoken-answer", text: "", content_blocks: blocks } });
      push({
        event: "add_message",
        data: { sender: "Machine", id: "spoken-answer", text: `Yes, two places are free.\n\n👉 **[Grab your spot](${cardUrl})**`, content_blocks: blocks },
      });
      push({ event: "end", data: { result: {} } });
      end();
    });

    expect(screen.getByRole("link", { name: "Book tickets" })).toHaveClass("cl-checkout-card-button");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Yes, two places are free. 2 tickets · Kayak at sunset, Lakeside Boathouse: Book tickets"
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("Grab your spot");
  });

  it("writes the card in the language of the answer", () => {
    storeConversation("de");
    renderWidget();

    expect(document.querySelector(".cl-checkout-card-title")).toHaveTextContent("2 Tickets · Kayak at sunset");
    expect(screen.getByRole("link", { name: "Tickets buchen" })).toHaveClass("cl-checkout-card-button");
    // The rest of the chat stays in its own language.
    expect(screen.getByPlaceholderText("Type your message...")).toBeVisible();
  });
});
