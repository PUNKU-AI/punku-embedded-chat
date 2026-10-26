import { getBookingkitCheckoutUrl } from "./bookingkitCheckout";
import { Language, toLanguage, translations, Translation } from "../translations";

/*
 * Checkout cards: the facts of a verified Bookingkit checkout link, which the
 * server sends next to the answer text. An agent message carries them in its
 * content blocks (the add_message stream event, data.content_blocks):
 *
 *   {"title": "Checkout", "contents": [{"type": "json", "data": {
 *     "kind": "punku.checkout_card", "v": 1, "url": "<checkout url>", "locale": "de",
 *     "bookings": [{"count": 2, "unit": "person", "product": "<experience name>"}]}}]}
 *
 * The widget keeps a card only when every value passes the checks below. An
 * answer without a usable card shows its checkout link as a link button.
 */

export type CheckoutCardBooking = {
  /** 1 to 99, or null when the server cannot count the booking. */
  count: number | null;
  /** "person": tickets per person. "group": one booking for a group of `count` people. */
  unit: "person" | "group" | null;
  /** The experience name as the vendor writes it. */
  product: string | null;
};

export type CheckoutCardData = {
  url: string;
  /** The language of the answer, for example "de". null: the chat language. */
  locale: string | null;
  bookings: CheckoutCardBooking[];
};

const KIND = "punku.checkout_card";
const VERSION = 1;
/** The server cuts each text at 120 characters. A longer text is not from it. */
const MAX_TEXT = 120;
/** The server sends 1 to 4 bookings per checkout link. */
const MAX_BOOKINGS = 4;
const MAX_COUNT = 99;
const UNITS = ["person", "group"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** A text of at most 120 characters with its spaces collapsed, null for none, undefined when it is not valid. */
function readText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > MAX_TEXT) return undefined;
  return value.replace(/\s+/g, " ").trim() || null;
}

function readBooking(value: unknown): CheckoutCardBooking | null {
  if (!isRecord(value)) return null;
  const { count = null, unit = null } = value;
  const product = readText(value.product);
  const countValid = count === null ||
    (typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= MAX_COUNT);
  const unitValid = unit === null || (typeof unit === "string" && UNITS.indexOf(unit) >= 0);
  if (!countValid || !unitValid || product === undefined) return null;
  return { count: count as number | null, unit: unit as CheckoutCardBooking["unit"], product };
}

/** One card with every value checked, or null. */
function readCard(value: unknown): CheckoutCardData | null {
  if (!isRecord(value)) return null;
  const url = typeof value.url === "string" ? getBookingkitCheckoutUrl(value.url) : null;
  const locale = readText(value.locale);
  const bookings = Array.isArray(value.bookings) ? value.bookings.map(readBooking) : [];
  if (!url || locale === undefined || bookings.length < 1 || bookings.length > MAX_BOOKINGS) return null;
  if (bookings.some((booking) => !booking)) return null;
  return { url, locale, bookings: bookings as CheckoutCardBooking[] };
}

/** The cards by URL: a later card for the same URL replaces the earlier one. */
export function mergeCheckoutCards(cards: CheckoutCardData[], added: CheckoutCardData[]): CheckoutCardData[] {
  if (added.length === 0) return cards;
  return added.reduce((merged, card) => [...merged.filter((other) => other.url !== card.url), card], cards);
}

/**
 * The checkout cards in the content blocks of an agent message. Only json
 * contents of kind punku.checkout_card, version 1, count: the widget never
 * reads tool output.
 */
export function readCheckoutCards(contentBlocks: unknown): CheckoutCardData[] {
  if (!Array.isArray(contentBlocks)) return [];
  const cards: CheckoutCardData[] = [];
  for (const block of contentBlocks) {
    if (!isRecord(block) || !Array.isArray(block.contents)) continue;
    for (const content of block.contents) {
      if (!isRecord(content) || content.type !== "json" || !isRecord(content.data)) continue;
      if (content.data.kind !== KIND || content.data.v !== VERSION) continue;
      const card = readCard(content.data);
      if (card) cards.push(card);
    }
  }
  return mergeCheckoutCards([], cards);
}

/** The cards of a stored message, checked again: storage can hold old or changed data. */
export function storedCheckoutCards(value: unknown): CheckoutCardData[] {
  if (!Array.isArray(value)) return [];
  return mergeCheckoutCards([], value.map(readCard).filter((card): card is CheckoutCardData => !!card));
}

/** The parameters that the server may add to a verified link: they do not change the cart. */
const BRAND_PARAMS = ["lang", "bklink"];
const REFERENCE = "sale_params[punku_reference]";

function parseUrl(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/** The cart: origin and path, without a trailing slash. */
const cartOf = (url: URL) => url.origin + url.pathname.replace(/\/$/, "");

/** The cart and its parameters, decoded and sorted, without the brand parameters. */
function canonicalUrl(url: URL): string {
  const params: string[][] = [];
  url.searchParams.forEach((value, key) => {
    if (BRAND_PARAMS.indexOf(key) < 0) params.push([key, value]);
  });
  params.sort((a, b) => (a[0] + "\u0000" + a[1] < b[0] + "\u0000" + b[1] ? -1 : 1));
  return cartOf(url) + JSON.stringify(params);
}

/**
 * The card of a checkout link. The answer's link is not byte-equal to the
 * card URL: Markdown percent-encodes the href, and the server may add lang
 * or bklink. Two links match on their punku reference when both have one,
 * else on the decoded cart and parameters. The newest card wins.
 */
export function findCheckoutCard(cards: CheckoutCardData[], href: string | undefined): CheckoutCardData | null {
  const link = href ? parseUrl(href) : null;
  if (!link || cards.length === 0) return null;
  const reference = link.searchParams.get(REFERENCE);
  const canonical = canonicalUrl(link);
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = parseUrl(cards[index].url);
    if (!card) continue;
    const cardReference = card.searchParams.get(REFERENCE);
    const match = reference && cardReference
      ? reference === cardReference && cartOf(card) === cartOf(link)
      : canonicalUrl(card) === canonical;
    if (match) return cards[index];
  }
  return null;
}

/**
 * An experience name in capitals only, in sentence case: "LEZIONI SCI
 * PRIVATE" gives "Lezioni sci private". Other names stay as the vendor
 * writes them. The name is never translated.
 */
export function experienceName(name: string, language: Language): string {
  const lower = name.toLocaleLowerCase(language);
  if (name === lower || name !== name.toLocaleUpperCase(language)) return name;
  for (let index = 0; index < lower.length; index += 1) {
    const upper = lower.charAt(index).toLocaleUpperCase(language);
    if (upper !== lower.charAt(index)) return lower.slice(0, index) + upper + lower.slice(index + 1);
  }
  return lower;
}

type PluralKeys = Record<"one" | "few" | "many" | "other", keyof Translation>;
const TICKETS: PluralKeys = {
  one: "checkoutTicketOne", few: "checkoutTicketFew", many: "checkoutTicketMany", other: "checkoutTicketOther",
};
const PEOPLE: PluralKeys = {
  one: "checkoutPersonOne", few: "checkoutPersonFew", many: "checkoutPersonMany", other: "checkoutPersonOther",
};

/** "2 Tickets", "5 biletów": the count with the plural form of its language. */
function countWith(count: number, words: PluralKeys, language: Language): string {
  let form = count === 1 ? "one" : "other";
  try {
    form = new Intl.PluralRules(language).select(count);
  } catch {
    // A browser without Intl.PluralRules keeps one and other.
  }
  const key = words[form as keyof PluralKeys] || words.other;
  return `${count} ${translations[language][key]}`;
}

export type CheckoutCardView = {
  /** "2 Tickets · Experience", "4 Personen · Experience", or only the experience name. */
  title: string;
  /** The button label: "Tickets buchen" for tickets, "Jetzt buchen" for the others. */
  label: string;
  language: Language;
};

/**
 * The texts of a card, in the card's language when the widget has it, else
 * in the chat language. null: no card, the link stays a link button. A card
 * shows one booking with its experience name.
 */
export function formatCheckoutCard(card: CheckoutCardData, chatLanguage: Language): CheckoutCardView | null {
  if (card.bookings.length !== 1) return null;
  const { count, unit, product } = card.bookings[0];
  if (!product) return null;
  const language = toLanguage(card.locale) || chatLanguage;
  const t = translations[language];
  const name = experienceName(product, language);
  const amount = count === null ? null
    : unit === "person" ? countWith(count, TICKETS, language)
    : unit === "group" ? countWith(count, PEOPLE, language)
    : null;
  return {
    title: amount ? `${amount} · ${name}` : name,
    label: unit === "person" ? t.checkoutBookTickets : t.checkoutBookNow,
    language,
  };
}
