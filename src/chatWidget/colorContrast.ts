/*
 * WCAG contrast between two colours. The widget uses it to keep links and
 * controls readable on a site's own colours (see controlColors.ts).
 */

export type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

export const BLACK: Rgb = [0, 0, 0];
export const WHITE: Rgb = [255, 255, 255];

function readAlpha(alpha: string | undefined): number {
  if (alpha === undefined) return 1;
  const value = alpha.endsWith("%") ? parseFloat(alpha) / 100 : parseFloat(alpha);
  return Math.min(1, Math.max(0, value));
}

/**
 * Reads a hex (#rgb, #rgba, #rrggbb, #rrggbbaa) or rgb()/rgba() colour with
 * its alpha. Returns null for any other value (names, gradients, variables).
 */
export function parseColor(value: unknown): { rgb: Rgb; alpha: number } | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const hex = HEX.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = digits.split("").map((digit) => digit + digit).join("");
    const rgb = [0, 2, 4].map((index) => parseInt(digits.slice(index, index + 2), 16)) as Rgb;
    const alpha = digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1;
    return { rgb, alpha };
  }
  const match = RGB.exec(text);
  if (match) {
    const channels = [match[1], match[2], match[3]].map(Number);
    if (channels.every((channel) => channel <= 255)) {
      return { rgb: channels as Rgb, alpha: readAlpha(match[4]) };
    }
  }
  return null;
}

/**
 * Reads an opaque colour. Returns null for anything else, also for a colour
 * that is not fully opaque: its look depends on what is behind it.
 */
export function parseOpaqueColor(value: unknown): Rgb | null {
  const color = parseColor(value);
  return color && color.alpha >= 0.999 ? color.rgb : null;
}

/** `top` with its opacity, painted on the opaque `backdrop`. */
export function paintOver(top: Rgb, alpha: number, backdrop: Rgb): Rgb {
  return top.map((channel, index) => Math.round(channel * alpha + backdrop[index] * (1 - alpha))) as Rgb;
}

/** Moves `from` toward `to`: 0 keeps `from`, 1 gives `to`. */
export function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return paintOver(to, amount, from);
}

export function toHex(rgb: Rgb): string {
  return "#" + rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("");
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
