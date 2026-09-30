import { installNitroLinkRecovery } from "./nitroLinkRecovery";

type NitroClick = MouseEvent & {
  nitroPromise?: Promise<void>;
  repeatDefaultIfNeeded?: boolean;
  nitroDefaultPrevented?: boolean;
};

type ClickOptions = MouseEventInit & {
  trusted?: boolean;
  canceled?: boolean;
  nitro?: boolean;
  repeatDefaultIfNeeded?: boolean;
  nitroDefaultPrevented?: boolean;
};

const getNativeDefaultPrevented = Object.getOwnPropertyDescriptor(
  Event.prototype,
  "defaultPrevented"
)!.get!;

// JSDOM cannot produce trusted input. Keep its real event cancellation state,
// and substitute only the trusted flag and the target visible inside the root.
function nitroClick(target: EventTarget | null, options: ClickOptions = {}) {
  const {
    trusted = true,
    canceled = true,
    nitro = true,
    repeatDefaultIfNeeded = true,
    nitroDefaultPrevented = false,
    ...mouseOptions
  } = options;
  const nativeEvent = new MouseEvent("click", {
    bubbles: true,
    composed: true,
    cancelable: true,
    button: 0,
    ...mouseOptions,
  }) as NitroClick;
  if (canceled) nativeEvent.preventDefault();

  if (nitro) {
    nativeEvent.nitroPromise = Promise.resolve();
    nativeEvent.repeatDefaultIfNeeded = repeatDefaultIfNeeded;
    nativeEvent.nitroDefaultPrevented = nitroDefaultPrevented;

    // This matches NitroPack's replacement of the public cancellation getter.
    Object.defineProperty(nativeEvent, "defaultPrevented", {
      configurable: true,
      get: () => nativeEvent.nitroDefaultPrevented,
    });
  }

  const preventDefault = jest.fn(() => {
    if (nitro) nativeEvent.nitroDefaultPrevented = true;
    else Event.prototype.preventDefault.call(nativeEvent);
  });
  const event = new Proxy(nativeEvent, {
    get(original, property) {
      if (property === "isTrusted") return trusted;
      if (property === "target") return target;
      if (property === "preventDefault") return preventDefault;
      return Reflect.get(original, property, original);
    },
  });
  return { event, preventDefault };
}

describe("installNitroLinkRecovery", () => {
  let host: HTMLElement;
  let root: ShadowRoot;
  let container: HTMLElement;
  let link: HTMLAnchorElement;
  let nestedText: HTMLElement;
  let listener: EventListener;
  let removeListener: jest.SpyInstance;
  let open: jest.SpyInstance;
  let cleanup: ReturnType<typeof installNitroLinkRecovery>;

  beforeEach(() => {
    host = document.createElement("punku-chat");
    document.body.appendChild(host);
    root = host.attachShadow({ mode: "closed" });
    container = document.createElement("div");
    root.appendChild(container);
    link = document.createElement("a");
    link.href = "https://example.com/faq?language=de&source=chat#tickets";
    link.target = "_blank";
    nestedText = document.createElement("span");
    nestedText.textContent = "Open FAQ";
    link.appendChild(nestedText);
    container.appendChild(link);

    const addListener = jest.spyOn(root, "addEventListener");
    removeListener = jest.spyOn(root, "removeEventListener");
    open = jest.spyOn(window, "open").mockReturnValue(null);
    cleanup = installNitroLinkRecovery(container);
    const registration = addListener.mock.calls.find(
      ([type, , capture]) => type === "click" && capture === true
    );
    expect(registration).toBeDefined();
    expect(typeof registration![1]).toBe("function");
    listener = registration![1] as EventListener;
  });

  afterEach(() => {
    cleanup?.();
    host.remove();
    jest.restoreAllMocks();
  });

  it("recovers a nested link while NitroPack hides native cancellation", () => {
    const { event, preventDefault } = nitroClick(nestedText);
    expect(event.defaultPrevented).toBe(false);
    expect(getNativeDefaultPrevented.call(event)).toBe(true);
    expect(host.shadowRoot).toBeNull();

    listener(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(event.nitroDefaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith(
      "https://example.com/faq?language=de&source=chat#tickets",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("recovers an anchor when its text node is the target", () => {
    const { event } = nitroClick(nestedText.firstChild);
    listener(event);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it.each(["https:", "http:"])("preserves %s URL queries and fragments", (protocol) => {
    link.href = `${protocol}//example.com/help?q=two%20words&lang=de#booking`;
    const { event } = nitroClick(link);
    listener(event);
    expect(open).toHaveBeenCalledWith(link.href, "_blank", "noopener,noreferrer");
  });

  it("does not open twice when NitroPack prevention already ran", () => {
    const { event, preventDefault } = nitroClick(link);
    listener(event);
    listener(event);
    expect(open).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the browser returns no window handle", () => {
    const scheduleRetry = jest.spyOn(window, "setTimeout");
    open.mockReturnValue(null);
    listener(nitroClick(link).event);
    expect(open).toHaveBeenCalledTimes(1);
    expect(scheduleRetry).not.toHaveBeenCalled();
  });

  const untouchedClicks: Array<[string, ClickOptions]> = [
    ["a click without NitroPack", { nitro: false }],
    ["a synthetic click", { trusted: false }],
    ["a click without native cancellation", { canceled: false }],
    ["a click that NitroPack will not replay", { repeatDefaultIfNeeded: false }],
    ["a deliberately prevented click", { nitroDefaultPrevented: true }],
    ["a middle click", { button: 1 }],
    ["a right click", { button: 2 }],
    ["a Shift click", { shiftKey: true }],
    ["an Alt click", { altKey: true }],
  ];

  it.each(untouchedClicks)("leaves %s untouched", (_, options) => {
    const { event, preventDefault } = nitroClick(link, options);
    listener(event);
    expect(open).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it.each([
    // eslint-disable-next-line no-script-url -- Verify rejection of unsafe link protocols.
    "javascript:alert(1)",
    "data:text/html,<p>hello</p>",
    "mailto:help@example.com",
    "tel:+491234567890",
    "file:///tmp/example.html",
    "ftp://example.com/file",
    "http://[",
  ])("does not recover an unsupported or invalid destination: %s", (destination) => {
    link.setAttribute("href", destination);
    const { event, preventDefault } = nitroClick(link);
    listener(event);
    expect(open).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it.each(["", "_self", "_parent", "_top", "named-window"])(
    "leaves target %s untouched",
    (target) => {
      link.target = target;
      listener(nitroClick(link).event);
      expect(open).not.toHaveBeenCalled();
    }
  );

  it("accepts a case-insensitive blank target", () => {
    link.target = "_BLANK";
    listener(nitroClick(link).event);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("leaves download links untouched, including an empty download attribute", () => {
    link.setAttribute("download", "");
    listener(nitroClick(link).event);
    expect(open).not.toHaveBeenCalled();
  });

  it("ignores links elsewhere in the shadow root", () => {
    root.appendChild(link);
    const { event, preventDefault } = nitroClick(nestedText);
    listener(event);
    expect(open).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("ignores an anchor without an href", () => {
    link.removeAttribute("href");
    listener(nitroClick(nestedText).event);
    expect(open).not.toHaveBeenCalled();
  });

  it("ignores non-link and missing targets", () => {
    listener(nitroClick(container).event);
    listener(nitroClick(null).event);
    listener(nitroClick(document.createTextNode("Detached text")).event);
    expect(open).not.toHaveBeenCalled();
  });

  it("removes the same capture listener during cleanup", () => {
    cleanup?.();
    expect(removeListener).toHaveBeenCalledWith("click", listener, true);
    cleanup = undefined;
  });

  it("does not install recovery without a shadow root or container", () => {
    const ordinaryContainer = document.createElement("div");
    document.body.appendChild(ordinaryContainer);
    const addListener = jest.spyOn(ordinaryContainer, "addEventListener");
    expect(installNitroLinkRecovery(null)).toBeUndefined();
    expect(installNitroLinkRecovery(ordinaryContainer)).toBeUndefined();
    expect(addListener).not.toHaveBeenCalled();
    ordinaryContainer.remove();
  });
});
