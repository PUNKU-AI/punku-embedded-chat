import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

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
  /** Reports a height change in px (positive = grew) after the field resized. */
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
 * lines. `overflow` is true when the text needs more than `maxLines` lines.
 */
export function computeTextareaHeight(metrics: TextareaMetrics): { height: number; overflow: boolean } {
  const extra = metrics.paddingTop + metrics.paddingBottom + metrics.borderTop + metrics.borderBottom;
  const maxLines = Math.max(1, metrics.maxLines);
  const minHeight = metrics.lineHeight + extra;
  const maxHeight = metrics.lineHeight * maxLines + extra;
  const contentHeight = metrics.scrollHeight + metrics.borderTop + metrics.borderBottom;
  const height = Math.min(Math.max(contentHeight, minHeight), maxHeight);
  return { height, overflow: contentHeight > maxHeight + 0.5 };
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
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    const computed = getComputedStyle(el);
    const extra = parsePx(computed.paddingTop) + parsePx(computed.paddingBottom)
      + parsePx(computed.borderTopWidth) + parsePx(computed.borderBottomWidth);
    // The browser scrolled the caret into view on input. `height: auto` resets
    // that scroll position, so restore it after the new height is applied.
    const scrollTop = el.scrollTop;
    // Shrink first, so scrollHeight reflects the current text and not the old height.
    el.style.height = "auto";
    let { height } = computeTextareaHeight({
      scrollHeight: el.scrollHeight,
      lineHeight: getLineHeightPx(computed),
      paddingTop: parsePx(computed.paddingTop),
      paddingBottom: parsePx(computed.paddingBottom),
      borderTop: parsePx(computed.borderTopWidth),
      borderBottom: parsePx(computed.borderBottomWidth),
      maxLines,
    });
    // Never take more than half of the chat window (short phone-landscape windows).
    const chatWindow = el.closest<HTMLElement>(".cl-window");
    if (chatWindow && chatWindow.clientHeight > 0) {
      height = Math.min(height, Math.max(Math.floor(chatWindow.clientHeight / 2), extra + 1));
    }
    el.style.height = `${computed.boxSizing === "content-box" ? height - extra : height}px`;
    // Measure the result: a consumer max-height in input_style can cap the field further.
    el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? "auto" : "hidden";
    // Typing at the end: show the newest line with its bottom padding. Editing
    // in the middle: keep the position the browser chose for the caret.
    const caretAtEnd = el.selectionEnd === el.value.length;
    el.scrollTop = caretAtEnd ? el.scrollHeight : scrollTop;
    const previous = appliedHeight.current;
    appliedHeight.current = height;
    if (previous !== null && previous !== height) {
      onHeightChange?.(height - previous);
    }
  }, [maxLines, onHeightChange]);

  // Layout effect: the height is applied before paint, so the field never flashes.
  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  /*
   * Same rule as the message list: keep wheel/touch scrolling inside the field
   * when the text overflows, so a host-page smooth-scroll library (Lenis and
   * friends) cannot hijack it through the composed event path.
   */
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const stopScrollPropagation = (event: Event) => event.stopPropagation();
    el.addEventListener("wheel", stopScrollPropagation, { passive: true });
    el.addEventListener("touchmove", stopScrollPropagation, { passive: true });
    return () => {
      el.removeEventListener("wheel", stopScrollPropagation);
      el.removeEventListener("touchmove", stopScrollPropagation);
    };
  }, []);

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
