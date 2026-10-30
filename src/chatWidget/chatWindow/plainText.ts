/*
 * Screen readers read a complete answer from the chat window's status region.
 * Answers are markdown, so remove the markdown syntax: read link text without
 * the URL, and no emphasis marks, heading marks, list bullets or table pipes.
 * No lookbehind in these patterns: older Safari cannot parse it, and one bad
 * pattern would stop the whole bundle.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    // Fenced code blocks: keep the code, drop the fences.
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
    // Link reference definitions ([name]: url) show nothing on screen. A
    // footnote definition ([^1]: text) shows, so it stays.
    .replace(/^[ \t]{0,3}\[(?!\^)[^\]]+\]:[ \t]*\S+.*$/gm, "")
    // Images: the alt text. Links: the link text. A link that shows only an
    // image without alt text has no text: leave it out (its button has a name).
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Reference links: [text][name] and [text][] read as their text.
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    // Line markers: headings, block quotes, bullets, rules, table separators.
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    // Task list marks ([ ] and [x]), after a bullet or a number.
    .replace(/^([ \t]*(?:\d+[.)][ \t]+)?)\[[ xX]\][ \t]+/gm, "$1")
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
    .trim();
}
