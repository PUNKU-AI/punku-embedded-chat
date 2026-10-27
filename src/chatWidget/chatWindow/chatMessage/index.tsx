import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import { ChatMessageType } from "../../../types/chatWidget";
import remarkGfm from "remark-gfm";
import { CircleAlert, ThumbsUp, ThumbsDown } from "lucide-react";
import { useState, useMemo } from "react";
import { sendFeedback } from "../../../controllers";
import { PunkuChatErrorPhase } from "../../clientErrors";
import BookingkitCheckoutLink from "../../components/BookingkitCheckoutLink";
import { AnswerContext, AnswerParagraph } from "../../components/CheckoutCard";
import { getBookingkitCheckoutUrl } from "../../bookingkitCheckout";
import { EMOJI_OR_SPACE } from "../../checkoutCards";

// Pins a readable base text size on every message. The widget renders inside a
// closed shadow root, so without this the font-size inherits from the host page
// and shrinks on deployments whose body/root font-size is small. Spread first so
// consumer *_message_style props (which spread after) can still override it.
const DEFAULT_MESSAGE_TEXT_STYLE: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: 1.5,
};

function findMessageInObject(obj: any): string | null {
  // If obj is a string, return it
  if (typeof obj === "string") return obj;
  
  // If obj is null or not an object, return null
  if (!obj || typeof obj !== "object") return null;

  // Direct text property
  if (obj.text) return obj.text;
  
  // Check artifacts message
  if (obj.artifacts?.message) return obj.artifacts.message;

  // Check messages array
  if (Array.isArray(obj.messages)) {
    const message = obj.messages.find((m: { message: any }) => m.message)?.message;
    if (message) return message;
  }

  // Check outputs structure
  if (obj.outputs?.[0]?.outputs) {
    const output = obj.outputs[0].outputs;
    if (typeof output === "string") return output;
    
    // Try to find message in nested outputs
    for (const key in output) {
      if (output[key]?.message?.text) {
        return output[key].message.text;
      }
    }
  }

  // Check results structure
  if (obj.results?.message?.text) {
    return obj.results.message.text;
  }

  // Recursive search for message or text properties
  for (const key in obj) {
    if (typeof obj[key] === "object") {
      const found = findMessageInObject(obj[key]);
      if (found) return found;
    }
  }

  return null;
}

function parseMessage(message: any): string {
  try {
    // Handle null or undefined
    if (!message) return "No message available";

    // Handle string messages directly
    if (typeof message === "string") return message;

    // Try to find message in object structure
    const foundMessage = findMessageInObject(message);
    if (foundMessage) return foundMessage;

    // If we still haven't found anything, return a JSON string
    return JSON.stringify(message);
  } catch (error) {
    console.error("Error parsing message:", error, message);
    return "Error displaying message";
  }
}

type Point = { line?: number; column?: number; offset?: number };

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { href?: unknown };
  children?: HastNode[];
  data?: Record<string, unknown>;
  position?: { start: Point; end: Point };
};

const meaningfulChildren = (node: unknown) =>
  ((node as HastNode | undefined)?.children || []).filter(
    (child) => !(child.type === "text" && !(child.value || "").trim())
  );

const isElement = (node: HastNode | undefined, tagName: string) =>
  node?.type === "element" && node.tagName === tagName;

/**
 * The children that are not only emoji, whitespace or a line break, such as
 * "👉 " or " 🚀✨". A hard line break (br) counts as whitespace, as a soft one.
 */
const nonEmojiChildren = (node: unknown) =>
  ((node as HastNode | undefined)?.children || []).filter(
    (child) => !(child.type === "text" && EMOJI_OR_SPACE.test(child.value || "")) && !isElement(child, "br")
  );

/**
 * The checkout link of an element that holds one Bookingkit checkout link and
 * nothing else but emoji, whitespace or line breaks, else null. The link may
 * sit in one strong or em: the agent writes **[Book now](url)**, which gives
 * p > strong > a.
 */
export function checkoutLinkOnly(node: unknown): string | null {
  let children = nonEmojiChildren(node);
  if (children.length === 1 && (isElement(children[0], "strong") || isElement(children[0], "em"))) {
    children = nonEmojiChildren(children[0]);
  }
  const href = children[0]?.properties?.href;
  return children.length === 1 && isElement(children[0], "a")
    ? getBookingkitCheckoutUrl(typeof href === "string" ? href : undefined)
    : null;
}

/** True when an element holds one checkout link and nothing else but emoji or whitespace. */
export function isCheckoutLinkOnly(node: unknown): boolean {
  return checkoutLinkOnly(node) !== null;
}

/**
 * True when an element holds exactly one link and nothing else but whitespace,
 * or a checkout link as isCheckoutLinkOnly allows.
 */
export function isLinkOnly(node: unknown): boolean {
  const children = meaningfulChildren(node);
  return (children.length === 1 && isElement(children[0], "a")) || isCheckoutLinkOnly(node);
}

/**
 * True when a list item holds only a link. In a loose list (blank lines
 * between the items) markdown wraps the link in a paragraph: li > p > a.
 */
export function isLinkOnlyListItem(node: unknown): boolean {
  if (isLinkOnly(node)) return true;
  const children = meaningfulChildren(node);
  return children.length === 1 && isElement(children[0], "p") && isLinkOnly(children[0]);
}

/** True when every item of a list holds only a link: the list of buttons drops its bullets. */
export function isLinkList(node: unknown): boolean {
  const items = meaningfulChildren(node);
  return items.length > 0 && items.every((item) => isElement(item, "li") && isLinkOnlyListItem(item));
}

/** The line and column of an offset in the Markdown, as the parser counts them (from 1). */
function pointAt(source: string, offset: number): Point {
  const before = source.slice(0, offset);
  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n"), offset };
}

/** A text node with its place in the Markdown, or nothing when it is empty. */
const textAt = (value: string, start: number, end: number, source: string): HastNode[] =>
  value ? [{ type: "text", value, position: { start: pointAt(source, start), end: pointAt(source, end) } }] : [];

type LineBreak = { above: HastNode[]; below: HastNode[]; aboveEnd: number; belowStart: number };

/**
 * The line breaks of a paragraph, in order: a hard break (br), or a soft
 * break (a newline in a text node), with the children above and below it and
 * the break's offsets in the Markdown. A text node whose newlines the
 * Markdown does not show one to one (a character reference) gives none.
 */
function lineBreaks(paragraph: HastNode, source: string): LineBreak[] {
  const children = paragraph.children || [];
  const breaks: LineBreak[] = [];
  children.forEach((child, index) => {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    if (start === undefined || end === undefined) return;
    const before = children.slice(0, index);
    const after = children.slice(index + 1);
    if (isElement(child, "br")) {
      breaks.push({ above: before, below: after, aboveEnd: start, belowStart: end });
      return;
    }
    const value = child.type === "text" ? child.value || "" : "";
    const valueBreaks = value.split("\n").length - 1;
    const markdown = source.slice(start, end);
    if (!valueBreaks || markdown.split("\n").length - 1 !== valueBreaks) return;
    let valueAt = -1;
    let markdownAt = -1;
    for (let count = 0; count < valueBreaks; count += 1) {
      valueAt = value.indexOf("\n", valueAt + 1);
      markdownAt = markdown.indexOf("\n", markdownAt + 1);
      const aboveText = value.slice(0, valueAt).replace(/\s+$/, "");
      breaks.push({
        above: [...before, ...textAt(aboveText, start, start + markdownAt, source)],
        below: [...textAt(value.slice(valueAt + 1), start + markdownAt + 1, end, source), ...after],
        aboveEnd: start + markdownAt,
        belowStart: start + markdownAt + 1,
      });
    }
  });
  return breaks;
}

/**
 * A paragraph whose last lines hold only a checkout link, as the agent
 * sometimes writes it under its lead-in: "Hier buchen:\n👉 **[Jetzt
 * buchen](url)**", after a soft or a hard line break. Returns the lines above
 * and the link lines as two paragraphs with their places in the Markdown,
 * else null. Emoji lines right above the link go with the link, as in a
 * paragraph of its own (isCheckoutLinkOnly). A paragraph of only emoji lines
 * and the link is a link paragraph already and needs no split.
 */
function splitLinkLines(paragraph: HastNode, source: string): { above: HastNode; line: HastNode } | null {
  const position = paragraph.position;
  if (!position || isCheckoutLinkOnly(paragraph)) return null;
  const found = lineBreaks(paragraph, source).find(({ below }) => isCheckoutLinkOnly({ children: below }));
  if (!found) return null;
  return {
    above: {
      ...paragraph, properties: { ...paragraph.properties }, children: found.above,
      position: { start: position.start, end: pointAt(source, found.aboveEnd) },
    },
    line: {
      ...paragraph, properties: { ...paragraph.properties }, children: found.below,
      position: { start: pointAt(source, found.belowStart), end: position.end },
    },
  };
}

/**
 * Gives a checkout link on the last line of a top-level paragraph a
 * paragraph of its own (a rehype plugin), so it becomes a checkout card or a
 * filled link button as a link alone in its paragraph does. The lines above
 * stay one paragraph. Checkout links on several last lines split one by one.
 * A link inside a sentence stays inline. The swarovski theme, with text
 * links only, does not use this plugin.
 */
function splitCheckoutLinkLines() {
  return (tree: HastNode, file: { value?: unknown }) => {
    const source = String(file.value ?? "");
    tree.children = (tree.children || []).flatMap((child) => {
      if (!isElement(child, "p")) return [child];
      const lines: HastNode[] = [];
      let rest = child;
      for (let split = splitLinkLines(rest, source); split; split = splitLinkLines(rest, source)) {
        lines.unshift({ type: "text", value: "\n" }, split.line);
        rest = split.above;
      }
      return [rest, ...lines];
    });
  };
}

const TOP_LEVEL = "punkuTopLevel";
const FOLLOWED = "punkuFollowed";

/**
 * Marks the paragraphs at the top level of an answer, and those that a later
 * block follows (a rehype plugin). Only top-level paragraphs become checkout
 * cards: a checkout link in a list item stays an outlined link button.
 */
function markTopLevelParagraphs() {
  return (tree: HastNode) => {
    const children = tree.children || [];
    children.forEach((child, index) => {
      if (!isElement(child, "p")) return;
      const followed = children.slice(index + 1).some((next) => next.type === "element");
      child.data = { ...child.data, [TOP_LEVEL]: true, [FOLLOWED]: followed };
    });
  };
}

const REHYPE_PLUGINS = [markTopLevelParagraphs];
const LINK_BUTTON_PLUGINS = [splitCheckoutLinkLines, markTopLevelParagraphs];

const markOf = (node: unknown, mark: string) => (node as HastNode | undefined)?.data?.[mark] === true;

/** The start and end offsets of a node in the Markdown, when the parser gives them. */
function sourceOf(node: unknown): { start: number; end: number } | undefined {
  const position = (node as HastNode | undefined)?.position;
  const start = position?.start.offset;
  const end = position?.end.offset;
  return start === undefined || end === undefined ? undefined : { start, end };
}

/** The class names of an element, with `added` when it is a string. */
const withClass = (className: string | undefined, added: string | false) =>
  [className, added].filter(Boolean).join(" ") || undefined;

export default function ChatMessage({
  message,
  message_id,
  isSend,
  error,
  user_message_style,
  bot_message_style,
  error_message_style,
  feedback,
  api_key,
  additional_headers,
  host_url,
  onFeedbackUpdate,
  onClientError,
  onCheckout,
  isLatest = false,
  onRetry,
  retryLabel = "Try again",
  helpfulLabel = "Helpful",
  notHelpfulLabel = "Not helpful",
  linkButtons = true,
  streaming = false,
}: ChatMessageType & {
  api_key?: string;
  additional_headers?: {[key: string]: string};
  host_url: string;
  onFeedbackUpdate?: (messageId: string, feedbackType: string) => void;
  onCheckout?: (url: string, opener: HTMLAnchorElement) => boolean;
  /** The newest answer keeps its feedback buttons visible. */
  isLatest?: boolean;
  onClientError?: (
    error: unknown,
    phase: PunkuChatErrorPhase,
    context?: Record<string, unknown>
  ) => void;
  /** Shown on the newest error message: sends the visitor's last message again. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Names of the feedback buttons for screen readers, in the chat language. */
  helpfulLabel?: string;
  notHelpfulLabel?: string;
  /** false: a link on its own line stays a text link (the swarovski theme). */
  linkButtons?: boolean;
}) {
  // Parse message content once and memoize it
  const parsedMessage = useMemo(() => parseMessage(message), [message]);
  const answerContext = useMemo(() => ({ streaming, messageId: message_id }), [streaming, message_id]);

  // Keep the opener mounted so checkout can capture and restore its focus.
  // A link that stands alone in a paragraph or list item is an action: it
  // renders as a button (see .cl-link-only in the widget stylesheet), unless
  // linkButtons is false. A checkout link also does in the agent's bold
  // format, next to emoji (isCheckoutLinkOnly). A checkout link alone in a
  // complete top-level paragraph is a checkout card when the server sent one
  // for it (AnswerParagraph). The cards, the language and the streaming state
  // come from contexts, so these components never change. A new card, or the
  // end of the stream, can swap a link button for a card (see AnswerParagraph).
  const markdownComponents = useMemo<Components>(() => ({
    a: ({ href, children, node, ...props }) => (
      <BookingkitCheckoutLink href={href} onCheckout={onCheckout} {...props}>
        {children}
      </BookingkitCheckoutLink>
    ),
    p: ({ node, children, ...props }) => linkButtons && markOf(node, TOP_LEVEL) ? (
      <AnswerParagraph
        {...props}
        href={checkoutLinkOnly(node)}
        linkOnly={isLinkOnly(node)}
        followed={markOf(node, FOLLOWED)}
        source={sourceOf(node)}
        onCheckout={onCheckout}
      >
        {children}
      </AnswerParagraph>
    ) : (
      <p {...props} className={linkButtons && isLinkOnly(node) ? "cl-link-only" : undefined}>{children}</p>
    ),
    // react-markdown 8 passes ordered, checked, index and depth to lists and
    // list items; they are not DOM attributes.
    li: ({ node, children, ordered, checked, index, className, ...props }) => (
      <li {...props} className={withClass(className, linkButtons && isLinkOnlyListItem(node) && "cl-link-only")}>
        {children}
      </li>
    ),
    // A list of only link buttons drops its bullets (.cl-link-list). In a
    // mixed list, the buttons keep the bullets and the indent of the others.
    ul: ({ node, children, ordered, depth, className, ...props }) => (
      <ul {...props} className={withClass(className, linkButtons && isLinkList(node) && "cl-link-list")}>{children}</ul>
    ),
    ol: ({ node, children, ordered, depth, className, ...props }) => (
      <ol {...props} className={withClass(className, linkButtons && isLinkList(node) && "cl-link-list")}>{children}</ol>
    ),
  }), [onCheckout, linkButtons]);

  // Initialize feedback state from the message's feedback property
  const [selectedFeedback, setSelectedFeedback] = useState<'thumbsUp' | 'thumbsDown' | null>(
    feedback === 'positive' ? 'thumbsUp' :
    feedback === 'negative' ? 'thumbsDown' :
    null
  );

  // The width keys of bot_message_style size the stack around the bubble, so
  // the stack's default width limit never caps a site's wider answers. The
  // bubble then fills the stack; percentages still refer to the message row.
  const {
    width: answerWidth,
    minWidth: answerMinWidth,
    maxWidth: answerMaxWidth,
    ...answerStyleRest
  } = bot_message_style || {};
  const answerStackStyle: React.CSSProperties | undefined =
    answerWidth === undefined && answerMinWidth === undefined && answerMaxWidth === undefined
      ? undefined
      : { width: answerWidth, minWidth: answerMinWidth, maxWidth: answerMaxWidth };
  const answerBubbleStyle: React.CSSProperties = {
    ...answerStyleRest,
    ...(answerWidth !== undefined ? { width: "100%" } : {}),
    ...(answerMinWidth !== undefined ? { minWidth: "100%" } : {}),
  };

  const handleFeedback = async (type: 'thumbsUp' | 'thumbsDown') => {
    setSelectedFeedback(type);
    const feedbackValue = type === 'thumbsUp' ? 'positive' : 'negative';

    // Update the message data with feedback
    if (onFeedbackUpdate && message_id) {
      onFeedbackUpdate(message_id, feedbackValue);
    }

    // Send feedback to server for AI messages
    if (!isSend && message_id && host_url) {
      try {
        await sendFeedback(
          host_url,
          message_id,
          feedbackValue,
          api_key,
          additional_headers
        );
        // console.log(`Feedback sent: ${feedbackValue} (positive_feedback: ${type === 'thumbsUp' ? 'true' : 'false'})`);
      } catch (error) {
        console.error("Error sending feedback:", error);
        onClientError?.(error, "send-feedback", {
          messageId: message_id,
          feedback: feedbackValue,
        });
        // Optionally revert the selection if feedback fails
        setSelectedFeedback(null);
        // Also revert the message data
        if (onFeedbackUpdate && message_id) {
          onFeedbackUpdate(message_id, ''); // Clear feedback
        }
      }
    }
  };

  return (
    <div
      className={
        "cl-chat-message " + (isSend ? " cl-justify-end" : " cl-justify-start") + (isLatest ? " cl-latest" : "")
      }
    >
      {isSend ? (
        <div 
          style={{
            ...DEFAULT_MESSAGE_TEXT_STYLE,
            ...(user_message_style || {}),
          }} 
          className="cl-user_message"
        >
          {parsedMessage}
        </div>
      ) : error ? (
        <div
          style={{
            ...DEFAULT_MESSAGE_TEXT_STYLE,
            ...(error_message_style || {}),
          }}
          // A site's error_message_style may set only some colours. Start from the
          // classic red box then, so a partial style never gives unreadable text.
          className={
            "cl-error_message" +
            (error_message_style && Object.keys(error_message_style).length > 0
              ? " cl-error_message--custom"
              : "")
          }
        >
          <CircleAlert className="cl-error-icon" size={18} aria-hidden="true" />
          <span className="cl-error-text">{parsedMessage}</span>
          {onRetry && (
            <button type="button" className="cl-retry-btn" onClick={onRetry}>
              {retryLabel}
            </button>
          )}
        </div>
      ) : (
        // The answer bubble, with the feedback buttons under it (not inside it).
        <div className="cl-message-stack" style={answerStackStyle}>
          <div
            style={{
              ...DEFAULT_MESSAGE_TEXT_STYLE,
              ...answerBubbleStyle,
            }}
            className={"cl-bot_message"}
          >
            <AnswerContext.Provider value={answerContext}>
              <Markdown
                className={"markdown-body prose flex flex-col word-break-break-word"}
                remarkPlugins={[remarkGfm]}
                rehypePlugins={linkButtons ? LINK_BUTTON_PLUGINS : REHYPE_PLUGINS}
                components={markdownComponents}
              >
                {parsedMessage}
              </Markdown>
            </AnswerContext.Provider>
          </div>

          {/* Simple thumbs up/down feedback - hide for welcome message */}
          {!isSend && !error && message_id !== "welcome-message" && (
            <div className="feedback-container">
              <div className="feedback-buttons">
                <button
                  type="button"
                  className={`feedback-button thumbs-up ${selectedFeedback === 'thumbsUp' ? 'selected' : ''}`}
                  onClick={() => handleFeedback('thumbsUp')}
                  aria-label={helpfulLabel}
                  aria-pressed={selectedFeedback === 'thumbsUp'}
                  title={helpfulLabel}
                >
                  <ThumbsUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`feedback-button thumbs-down ${selectedFeedback === 'thumbsDown' ? 'selected' : ''}`}
                  onClick={() => handleFeedback('thumbsDown')}
                  aria-label={notHelpfulLabel}
                  aria-pressed={selectedFeedback === 'thumbsDown'}
                  title={notHelpfulLabel}
                >
                  <ThumbsDown size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`
        .feedback-container {
          margin-top: 8px;
          display: flex;
          justify-content: flex-end;
        }
        
        .feedback-buttons {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        
        .feedback-button {
          padding: 4px;
          border: none;
          background: none;
          cursor: pointer;
          /* The widget stylesheet sets readable colours per theme. */
          color: var(--cl-feedback-ink, #9ca3af);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s ease;
          opacity: 0.7;
        }
        
        .feedback-button:hover {
          opacity: 1;
        }

        .feedback-button:focus-visible {
          opacity: 1;
          outline: 2px solid currentColor;
          outline-offset: 2px;
          border-radius: 4px;
        }
        
        .feedback-button.thumbs-up:hover {
          color: var(--cl-feedback-up, #10b981);
        }
        
        .feedback-button.thumbs-down:hover {
          color: #ef4444;
        }
        
        .feedback-button.thumbs-up.selected {
          color: var(--cl-feedback-up, #10b981);
          outline: 2px solid var(--cl-feedback-up, #10b981);
          outline-offset: 2px;
          border-radius: 4px;
        }
        
        .feedback-button.thumbs-down.selected {
          color: #ef4444;
          outline: 2px solid #ef4444;
          outline-offset: 2px;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
