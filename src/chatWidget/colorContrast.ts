/*
 * WCAG contrast between two colours. The widget uses it to keep links
 * readable on a site's own answer colour.
 */

type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

function alphaIsOpaque(alpha: string | undefined): boolean {
  if (alpha === undefined) return true;
  const value = alpha.endsWith("%") ? parseFloat(alpha) / 100 : parseFloat(alpha);
  return value >= 0.999;
}

/**
 * Reads a hex (#rgb, #rgba, #rrggbb, #rrggbbaa) or rgb()/rgba() colour.
 * Returns null for any other value (names, gradients, variables) and for a
 * colour that is not fully opaque: its look depends on what is behind it.
 */
export function parseOpaqueColor(value: unknown): Rgb | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const hex = HEX.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = digits.split("").map((digit) => digit + digit).join("");
    if (digits.length === 8 && digits.slice(6).toLowerCase() !== "ff") return null;
    return [0, 2, 4].map((index) => parseInt(digits.slice(index, index + 2), 16)) as Rgb;
  }
  const rgb = RGB.exec(text);
  if (rgb && alphaIsOpaque(rgb[4])) {
    const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (channels.every((channel) => channel <= 255)) return channels as Rgb;
  }
  return null;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The WCAG contrast ratio of two colours, from 1 to 21. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * True when text in `foreground` reads with at least 4.5:1 (WCAG AA) on
 * `background`. False when either colour cannot be read.
 */
export function isReadableOn(foreground: unknown, background: unknown): boolean {
  const text = parseOpaqueColor(foreground);
  const surface = parseOpaqueColor(background);
  if (!text || !surface) return false;
  return contrastRatio(text, surface) >= 4.5;
}
