import { LANGUAGES, Language, toLanguage } from "../translations";
import type { LoadingMessages } from "../types/chatWidget";

// Words and letters that mark a language in a short text. Each list keeps to
// words that are rare in the other six languages.
const MARKERS: Record<Language, [string, string]> = {
  en: ["the and you your for with this that are is of it we our just please", ""],
  de: ["der die das und ich ist wird werden nicht mal ein eine einen mich dich dir dein wir mit für nach gleich bitte kurz noch auf den dem schon bin", "äöüß"],
  it: ["il gli che per sto sta di della dei sono ci è più ti", "ìò"],
  es: ["el los las y estoy voy ya muy mis casi", "ñ"],
  pt: ["os não vou você seu dos uma em é isto", "ãõ"],
  fr: ["les je vous est une pour pas nous avec sur et mes cela", "œ"],
  pl: ["się jest w że już czy dla jak", "ąćęłńśźż"],
};

/**
 * The language of a site's thinking texts, or null when the texts do not show
 * it clearly: at least two hits, and twice as many as any other language.
 */
export function detectLanguage(texts: string[]): Language | null {
  const scores = LANGUAGES.map(() => 0);
  for (const word of texts.join(" ").toLowerCase().split(/[^a-zß-ÿąćęłńśźżœ]+/)) {
    if (!word) continue;
    LANGUAGES.forEach((language, index) => {
      const [words, letters] = MARKERS[language];
      if ((" " + words + " ").includes(" " + word + " ")) scores[index] += 1;
      if (letters.split("").some((letter) => word.includes(letter))) scores[index] += 1;
    });
    // English verbs in -ing: "Finding", "Checking".
    if (word.length > 4 && word.endsWith("ing")) scores[0] += 1;
  }
  const sorted = scores.slice().sort((a, b) => b - a);
  return sorted[0] >= 2 && sorted[0] >= 2 * sorted[1] ? LANGUAGES[scores.indexOf(sorted[0])] : null;
}

function cleanList(list: unknown): string[] {
  return Array.isArray(list)
    ? list.map((text) => (typeof text === "string" ? text.trim() : "")).filter(Boolean)
    : [];
}

/**
 * The site's thinking texts for a chat in this language, or null for the
 * built-in phrases.
 * - A list in one language shows as written, unless its texts are clearly in
 *   another language than the chat.
 * - Texts per language ({"it": [...], "default": [...]}) show the chat's
 *   language, else "default".
 */
export function chooseLoadingMessages(loadingMessages: LoadingMessages | undefined, language: Language): string[] | null {
  if (Array.isArray(loadingMessages)) {
    const texts = cleanList(loadingMessages);
    const detected = detectLanguage(texts);
    return texts.length > 0 && (!detected || detected === language) ? texts : null;
  }
  if (!loadingMessages || typeof loadingMessages !== "object") return null;
  const key = Object.keys(loadingMessages).find((name) => toLanguage(name) === language);
  const texts = cleanList(key ? loadingMessages[key] : []);
  if (texts.length > 0) return texts;
  const fallback = cleanList(loadingMessages.default);
  return fallback.length > 0 ? fallback : null;
}

// Trailing emoji with their spaces, variation selectors and joiners, as in
// "Die Karten werden sortiert… 🛶".
const EMOJI_TAIL = /(?:\s|[←-⯿️‍]|[\ud83c-\ud83e][\udc00-\udfff])+$/;

/**
 * A thinking text in two parts, for the growing dots between them: the text
 * without its own trailing dots or ellipsis, and the emoji after them.
 * "Checking prices…" gives ["Checking prices", ""];
 * "Kurs wird berechnet… 🛶" gives ["Kurs wird berechnet", " 🛶"].
 */
export function splitThinkingText(text: string): [string, string] {
  const tail = (text.match(EMOJI_TAIL) || [""])[0];
  const head = text.slice(0, text.length - tail.length).replace(/[\s.…]+$/, "");
  return [head, tail];
}
