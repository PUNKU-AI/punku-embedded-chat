import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { containScrollEvents } from "../scrollContainment";

/** The field grows with the text up to this many lines, then scrolls inside itself. */
export const DEFAULT_MAX_LINES = 6;

export type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter (without Shift) outside an IME composition. */
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** Consumer `input_style`; spread last so it can override the defaults. */
  style?: React.CSSProperties;
  maxLines?: number;
  /** Reports a change of the rendered height in px (positive = grew). */
  onHeightChange?: (delta: number) => void;
};

const parsePx = (value: string | null | undefined) => {
  const parsed = parseFloat(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Line height in px. Browsers resolve `line-height` to px; jsdom and inline
 * unitless values ("1.5") need the font size; "normal" falls back to 1.2em.
 */
export function getLineHeightPx(style: CSSStyleDeclaration): number {
  const raw = style.lineHeight || "";
  const fontSize = parsePx(style.fontSize) || 16;
  if (raw.endsWith("px")) {
    return parsePx(raw) || fontSize * 1.2;
  }
  const unitless = parseFloat(raw);
  if (Number.isFinite(unitless) && unitless > 0) {
    return unitless * fontSize;
  }
  return fontSize * 1.2;
}

export type TextareaMetrics = {
  /** `scrollHeight` measured while the field has `height: auto` (content + padding). */
  scrollHeight: number;
  lineHeight: number;
  paddingTop: number;
  paddingBottom: number;
  borderTop: number;
  borderBottom: number;
  maxLines: number;
};

/**
 * Border-box height for a textarea: at least one line, at most `maxLines`
 * lines. Whether the text overflows is measured after the height is applied.
 */
export function computeTextareaHeight(metrics: TextareaMetrics): number {
  const extra = metrics.paddingTop + metrics.paddingBottom + metrics.borderTop + metrics.borderBottom;
  const maxLines = Math.max(1, metrics.maxLines);
  const minHeight = metrics.lineHeight + extra;
  const maxHeight = metrics.lineHeight * maxLines + extra;
  const contentHeight = metrics.scrollHeight + metrics.borderTop + metrics.borderBottom;
  return Math.min(Math.max(contentHeight, minHeight), maxHeight);
}

/** True while an input-method editor composes text (CJK, dictation, some Android keyboards). */
export function isComposingEvent(event: {
  nativeEvent?: { isComposing?: boolean };
  keyCode?: number;
}): boolean {
  return Boolean(event.nativeEvent?.isComposing) || event.keyCode === 229;
}

/**
 * The chat composer: a textarea that grows with the text. Enter sends,
 * Shift+Enter inserts a line break, and Enter during an IME composition
 * only confirms the composition.
 */
const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(function ChatInput(
  {
    value,
    onChange,
    onSend,
    disabled = false,
    placeholder,
    ariaLabel,
    className,
    style,
    maxLines = DEFAULT_MAX_LINES,
    onHeightChange,
  },
  ref
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const appliedHeight = useRef<number | null>(null);
  const measuredWidth = useRef<number | null>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    const computed = getComputedStyle(el);
    const paddingTop = parsePx(computed.paddingTop);
    const paddingBottom = parsePx(computed.paddingBottom);
    const borderTop = parsePx(computed.borderTopWidth);
    const borderBottom = parsePx(computed.borderBottomWidth);
    const extra = paddingTop + paddingBottom + borderTop + borderBottom;
    // input_style may switch the box model; style.height is written in that model.
    const toStyleHeight = (borderBoxHeight: number) =>
      `${computed.boxSizing === "content-box" ? borderBoxHeight - extra : borderBoxHeight}px`;
    measuredWidth.current = el.clientWidth;

    // The browser scrolled the caret into view on input. `height: auto` resets
    // that scroll position, so restore it after the new height is applied.
    const scrollTop = el.scrollTop;
    // Measure without a scrollbar: a classic (non-overlay) scrollbar narrows
    // the text and can add a wrapped line to the measurement. Shrink first, so
    // scrollHeight reflects the current text and not the old height.
    el.style.overflowY = "hidden";
    el.style.height = "auto";
    let height = computeTextareaHeight({
      scrollHeight: el.scrollHeight,
      lineHeight: getLineHeightPx(computed),
      paddingTop,
      paddingBottom,
      borderTop,
      borderBottom,
      maxLines,
    });
    // Never take more than half of the chat window (short phone-landscape windows).
    const chatWindow = el.closest<HTMLElement>(".cl-window");
    if (chatWindow && chatWindow.clientHeight > 0) {
      height = Math.min(height, Math.max(Math.floor(chatWindow.clientHeight / 2), extra + 1));
    }
    el.style.height = toStyleHeight(height);

    // Fill the row. The send button, or a fixed height from
    // input_container_style, can make the row taller than the text needs. The
    // field then takes the whole row height, as the one-line input did before.
    const row = el.parentElement;
    if (row) {
      const rowStyle = getComputedStyle(row);
      const rowHeight = row.clientHeight - parsePx(rowStyle.paddingTop) - parsePx(rowStyle.paddingBottom);
      if (rowHeight > el.offsetHeight + 1) {
        el.style.height = toStyleHeight(rowHeight);
      }
    }

    // Measure the result: CSS max-height (a consumer input_style, or the row
    // height) can cap the field further.
    el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? "auto" : "hidden";
    // Typing at the end: show the newest line with its bottom padding. Editing
    // in the middle: keep the position the browser chose for the caret.
    const caretAtEnd = el.selectionEnd === el.value.length;
    el.scrollTop = caretAtEnd ? el.scrollHeight : scrollTop;
    // Report the rendered border-box height, not the requested one.
    const rendered = el.offsetHeight;
    const previous = appliedHeight.current;
    appliedHeight.current = rendered;
    if (previous !== null && previous !== rendered) {
      onHeightChange?.(rendered - previous);
    }
  }, [maxLines, onHeightChange]);

  // A host can change input_style at runtime (font size, line height, padding).
  // The style object is recreated on each render, so compare its contents.
  const styleKey = style ? JSON.stringify(style) : "";

  // Layout effect: the height is applied before paint, so the field never
  // flashes. The placeholder counts too: a long placeholder wraps in an empty field.
  useLayoutEffect(() => {
    resize();
  }, [value, placeholder, styleKey, resize]);

  // The same text wraps differently when the field gets narrower or wider
  // (host `width` attribute, phone rotation, viewport resize).
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    let frame: number | undefined;
    const observer = new ResizeObserver(() => {
      // Our own height changes notify as well; only a width change needs a new
      // measurement. Run it in the next frame: a size change inside the
      // callback itself raises "ResizeObserver loop" errors (WebKit).
      if (el.clientWidth === measuredWidth.current || frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        resize();
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [resize]);

  // Same rule as the message list: scrolling inside the field must not reach
  // a host smooth-scroll library.
  useEffect(() => containScrollEvents(innerRef.current), []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (isComposingEvent(event)) return;
    event.preventDefault();
    if (!disabled) onSend();
  };

  return (
    <textarea
      ref={innerRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      rows={1}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete="off"
      autoCapitalize="sentences"
      // Phone keyboards label the Enter key "Send". The installed React types
      // predate the attribute; React 18 knows it and renders `enterkeyhint`.
      {...({ enterKeyHint: "send" } as Record<string, string>)}
      style={style}
      className={className}
    />
  );
});

export default ChatInput;
