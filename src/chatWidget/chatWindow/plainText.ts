/*
 * Screen readers read a complete answer from the chat window's status region.
 * Answers are markdown, so remove the markdown syntax: read link text without
 * the URL, footnotes as the screen shows them, and no emphasis marks, heading
 * marks, list bullets or table pipes. footnotesLabel is the heading of the
 * footnotes, in the chat language. No lookbehind in these patterns: older
 * Safari cannot parse it, and one bad pattern would stop the whole bundle.
 */
export function markdownToPlainText(markdown: string, footnotesLabel = "Footnotes"): string {
  // Backslash escapes (\* or 1\.) show only the character. Set it aside until
  // the end, so that no rule below takes it for a mark. Code keeps its
  // backslashes, as on screen.
  const escaped = markdown.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)|\\([!-/:-@[-`{-~])/g,
    (_escape: string, code: string | undefined, char: string) => code || setAside(char));
  return footnotesAsShown(escaped, footnotesLabel)
    // Fenced code blocks (backticks or tildes): keep the code, drop the fences.
    .replace(/(```|~~~)[^\n]*\n?([\s\S]*?)\1/g, "$2")
    // Link reference definitions ([name]: url) show nothing on screen. A
    // footnote definition left by now is in code, where it shows as text.
    .replace(/^[ \t]{0,3}\[(?!\^)[^\]]+\]:[ \t]*\S+.*$/gm, "")
    // Images: the alt text. Links: the link text. A link that shows only an
    // image without alt text has no text: leave it out (its button has a name).
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\]\([^)\n]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Reference links: [text][name] and [text][] read as their text.
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    // Line markers: headings, block quotes, bullets, rules, table separators.
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    // Task list marks ([ ] and [x]) of list items. On a line without a bullet
    // or a number, the screen shows the marks as text, so they stay.
    .replace(/^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[[ xX]\][ \t]+/gm, "$1")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, "")
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, "")
    // Table rows: cells separated by commas.
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_row, cells: string) =>
      cells.split("|").map((cell) => cell.trim()).filter(Boolean).join(", ")
    )
    // Inline marks: bold, italic, strikethrough, code.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\s][^*]*)\*/g, "$1")
    .replace(/(^|[^\w])__([^_]+)__(?=[^\w]|$)/g, "$1$2")
    .replace(/(^|[^\w])_([^_\s][^_]*)_(?=[^\w]|$)/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    // The characters set aside, back as plain characters. A loop, not a regex:
    // the minifier writes a private-use range as raw characters, and a page that
    // reads the bundle in another encoding could then not parse it.
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 0xe000 && code <= 0xe07f ? String.fromCharCode(code - 0xe000) : char;
    })
    .join("");
}

// An ASCII character as a private-use character, which no rule takes for a mark.
const setAside = (char: string) => String.fromCharCode(0xe000 + char.charCodeAt(0));

const FOOTNOTE_DEFINITION = /^[ \t]{0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/;
const FOOTNOTE_MARK = /\[\^([^\]\s]+)\]/g;
// A line that starts a new block ends the first paragraph of a footnote.
const BLOCK_START = /^[ \t]{0,3}(?:[-*+][ \t]|\d+[.)][ \t]|#{1,6}[ \t]|>|```|~~~)/;
const INDENT = /^(?: {4}|\t)/;
// A fenced code block opens with three or more backticks or tildes. The same
// character, at least as many times and alone on its line, closes it.
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/;

/** Says line by line whether a line is in a fenced code block, its fences included. */
function codeLines() {
  let fence = "";
  return (line: string) => {
    const match = FENCE.exec(line);
    if (fence) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = "";
      return true;
    }
    // A backtick after backticks is inline code, not a fence.
    if (match && !(match[1][0] === "`" && match[2].includes("`"))) fence = match[1];
    return !!fence;
  };
}

/*
 * GitHub footnotes, as the answer shows them (plainFootnotes in chatMessage).
 * A mark reads as its number in brackets: the numbers follow the order of
 * first use. The notes follow at the end, under the heading that only screen
 * readers see, each one with its number. A note without a mark does not show,
 * and a mark without a note stays as typed. Labels match without case. Code
 * keeps its marks.
 */
function footnotesAsShown(markdown: string, footnotesLabel: string): string {
  if (!markdown.includes("[^")) return markdown;
  const text: string[] = [];
  const notes = new Map<string, string[]>();
  let note: string[] | null = null;
  let afterBlankLine = false;
  const inCode = codeLines();
  for (const line of markdown.split("\n")) {
    if (note) {
      // A note goes on in lines indented by four spaces. Its paragraph also
      // goes on in the next lines, up to a blank line or a new block.
      if (!line.trim()) {
        note.push("");
        afterBlankLine = true;
        continue;
      }
      if (INDENT.test(line) || (!afterBlankLine && !BLOCK_START.test(line) && !FOOTNOTE_DEFINITION.test(line))) {
        note.push(line.replace(INDENT, ""));
        afterBlankLine = false;
        continue;
      }
      note = null;
    }
    const definition = inCode(line) ? null : FOOTNOTE_DEFINITION.exec(line);
    if (!definition) {
      text.push(line);
      continue;
    }
    note = [definition[2]];
    afterBlankLine = false;
    // The first note of a label wins.
    const label = definition[1].toLowerCase();
    if (!notes.has(label)) notes.set(label, note);
  }
  if (notes.size === 0) return markdown;

  // The labels in the order of their first mark. The brackets are set aside:
  // two marks in a row ([1][2]) would look like a reference link.
  const order: string[] = [];
  const markNumbers = (lines: string[]) => {
    const inCode = codeLines();
    return lines.map((line) => {
      if (inCode(line)) return line;
      // The odd parts of the split are inline code.
      return line.split(/(`[^`]+`)/).map((part, index) => index % 2 ? part : part.replace(FOOTNOTE_MARK, (mark, label: string) => {
        const key = label.toLowerCase();
        if (!notes.has(key)) return mark;
        const number = order.indexOf(key) + 1 || order.push(key);
        return `${setAside("[")}${number}${setAside("]")}`;
      })).join("");
    });
  };
  const body = markNumbers(text).join("\n").trimEnd();
  // A note can mark another note: the loop also reaches the labels that it adds.
  const shown: string[] = [];
  for (let index = 0; index < order.length; index++) {
    shown.push(`${index + 1}. ${markNumbers(notes.get(order[index])!).join("\n").trim()}`);
  }
  return shown.length ? `${body}\n\n${footnotesLabel}\n${shown.join("\n")}` : body;
}
