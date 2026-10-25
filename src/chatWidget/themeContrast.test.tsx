import React from 'react';
import { render } from '@testing-library/react';
import ChatWidget from './index';
import { contrastRatio, paintOver, parseColor, Rgb, toHex } from './colorContrast';
import { BOUNDARY_MIN, guardControlColors, ICON_MIN, TEXT_MIN, THEME_COLORS, ThemeName } from './controlColors';

// Only the widget stylesheet matters here: render the widget without its parts.
jest.mock('./chatTrigger', () => () => null);
jest.mock('./chatWindow', () => () => null);

// Every built-in theme reads at WCAG AA on its own, without the contrast
// guard: text at 4.5:1 (1.4.3), controls, icons and focus marks at 3:1
// against the colour behind them (1.4.11). The colours come from the real
// widget stylesheet. The swarovski theme keeps the look of the
// swarovski-widget branch: its colours are pinned and not measured.

type Rule = { selectors: string[]; declarations: Map<string, string> };

/** The plain style rules, in order. At-rules (fonts, media queries, keyframes) are skipped. */
function styleRules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf('{', index);
    if (open < 0) break;
    let depth = 1;
    let end = open + 1;
    while (depth > 0 && end < text.length) {
      if (text[end] === '{') depth += 1;
      if (text[end] === '}') depth -= 1;
      end += 1;
    }
    const prelude = text.slice(index, open).trim();
    if (!prelude.startsWith('@')) {
      const declarations = new Map<string, string>();
      for (const part of text.slice(open + 1, end - 1).split(';')) {
        const colon = part.indexOf(':');
        if (colon > 0) declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).replace('!important', '').trim());
      }
      rules.push({ selectors: prelude.split(',').map((selector) => selector.trim().replace(/\s+/g, ' ')), declarations });
    }
    index = end;
  }
  return rules;
}

const { container } = render(
  <ChatWidget host_url="http://localhost:3000" flow_id="theme-test" input_value="" input_type="chat" output_type="chat" />,
);
const rules = styleRules(container.querySelector('style')?.textContent ?? '');

/** The value of the first [selector, property] that the stylesheet sets (the last rule wins). */
function declared(...candidates: Array<[string, string]>): string | undefined {
  for (const [selector, property] of candidates) {
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      const value = rules[index].selectors.includes(selector) && rules[index].declarations.get(property);
      if (value) return value;
    }
  }
  return undefined;
}

type Paint = { rgb: Rgb; alpha: number };
const NAMES: Record<string, string> = { white: '#ffffff', black: '#000000', transparent: 'rgba(0, 0, 0, 0)' };

/** The colours of a value: one, or each stop of a gradient. var() takes the theme token. */
function paints(theme: ThemeName, value: string | undefined): Paint[] {
  if (!value) throw new Error('The stylesheet sets no colour here.');
  let resolved = value.replace(/var\(--tw-[a-z-]+-opacity\)/g, '1');
  // A fallback can be a var() too: var(--a, var(--b)) resolves in two passes.
  for (let previous = ''; previous !== resolved;) {
    previous = resolved;
    resolved = resolved.replace(/var\((--cl-[a-z-]+)(?:, ([^)]+))?\)/g, (_match, name: string, fallback?: string) => token(theme, name) ?? fallback ?? '');
  }
  const tokens = resolved.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black|transparent)\b/gi) ?? [];
  return tokens.map((color) => {
    const parsed = parseColor(NAMES[color.toLowerCase()] ?? color);
    if (!parsed) throw new Error(`Cannot read the colour ${color}.`);
    return parsed;
  });
}

const token = (theme: ThemeName, name: string) =>
  declared([`.cl-window.theme-${theme}`, name], ['.cl-window', name]);

/** Each colour that shows: every stop, each painted on every colour behind it. */
const onTop = (top: Paint[], behind: Rgb[]): Rgb[] =>
  top.flatMap((paint) => behind.map((back) => paintOver(paint.rgb, paint.alpha, back)));

type Pair = { what: string; foreground: Paint[]; background: Rgb[]; minimum: number };

/** The colours of one theme, read from the stylesheet (theme rule first, then the base rule). */
function palette(theme: ThemeName) {
  const of = (part: string, property: string, base = part, baseProperty = property) =>
    paints(theme, declared([`.theme-${theme} ${part}`, property], [base, baseProperty]));
  const list = of('.cl-messages_container', 'background', '.cl-messages_container', 'background-color');
  const listRgb = onTop(list, [[255, 255, 255]]);
  const bar = onTop(of('.cl-input_container', 'background', '.cl-input_container', 'background-color'), [[255, 255, 255]]);
  const field = onTop(paints(theme, token(theme, '--cl-field')), bar);
  const bubble = onTop(of('.cl-bot_message', 'background', '.cl-bot_message', 'background-color'), listRgb);
  const header = onTop(of('.cl-header', 'background', '.cl-header', 'background-color'), [[255, 255, 255]]);
  // The theme subtitle (a header without button_color), on top of the base 85%.
  const opacity = Number(declared(
    [`.cl-window.theme-${theme} .cl-header .cl-header-subtitle`, 'opacity'],
    ['.cl-window .cl-header:not(.cl-header--colored) .cl-header-subtitle', 'opacity'],
    ['.cl-header-subtitle', 'opacity'],
  ) ?? 1);
  const subtitle = of('.cl-header-subtitle', 'color').map((paint) => ({ ...paint, alpha: paint.alpha * opacity }));
  const errorBg = onTop(paints(theme, declared([`.theme-${theme} .cl-error_message`, '--cl-error-bg'], ['.cl-error_message', '--cl-error-bg'])), listRgb);
  const chipBg = onTop(paints(theme, token(theme, '--cl-chip-bg')), listRgb);
  const send = of('.cl-send-button', 'background', '.cl-send-button', 'background-color');
  const launcher = paints(theme, declared([`.theme-${theme}.cl-trigger`, 'background'], ['.cl-trigger', 'background-color']));
  const white: Paint[] = [{ rgb: [255, 255, 255], alpha: 1 }];
  const color = (name: string) => paints(theme, token(theme, name));
  // The colour of a focus ring; currentColor is the link colour.
  const ring = (selector: string) => {
    const outline = declared([selector, 'outline']);
    const shown = outline?.includes('currentColor') ? color('--cl-link') : paints(theme, outline);
    if (!shown.length) throw new Error(`No colour in the outline of ${selector}.`);
    return shown;
  };
  const pairs: Pair[] = [
    { what: 'header title and icons', foreground: of('.cl-header', 'color'), background: header, minimum: TEXT_MIN },
    { what: 'header subtitle', foreground: subtitle, background: header, minimum: TEXT_MIN },
    { what: 'answer text', foreground: of('.cl-bot_message', 'color'), background: bubble, minimum: TEXT_MIN },
    // The thinking phrase shows the answer text at 85% opacity.
    {
      what: 'thinking phrase',
      foreground: of('.cl-bot_message', 'color').map((paint) => ({ ...paint, alpha: paint.alpha * 0.85 })),
      background: bubble, minimum: TEXT_MIN,
    },
    { what: 'link in an answer', foreground: color('--cl-link'), background: bubble, minimum: TEXT_MIN },
    // The focus ring of a link takes the link colour (currentColor). Without
    // that rule, it takes the markdown default: #0969da on a light system.
    {
      what: 'focus ring of a link in an answer',
      foreground: declared(['.cl-window .cl-bot_message .markdown-body a:focus-visible', 'outline-color']) === 'currentColor'
        ? color('--cl-link') : paints(theme, '#0969da'),
      background: bubble, minimum: BOUNDARY_MIN,
    },
    { what: 'outlined link button', foreground: color('--cl-link'), background: bubble, minimum: BOUNDARY_MIN },
    { what: 'outlined link button focus mark', foreground: ring('.cl-window .cl-bot_message .markdown-body li.cl-link-only a:focus-visible'), background: bubble, minimum: BOUNDARY_MIN },
    { what: 'filled link button', foreground: color('--cl-accent'), background: bubble, minimum: BOUNDARY_MIN },
    { what: 'filled link button focus mark', foreground: ring('.cl-window .cl-bot_message .markdown-body > p.cl-link-only a:focus-visible'), background: bubble, minimum: BOUNDARY_MIN },
    { what: 'filled link button on hover', foreground: color('--cl-accent-hover'), background: bubble, minimum: BOUNDARY_MIN },
    { what: 'filled link button label', foreground: color('--cl-on-accent'), background: onTop(color('--cl-accent'), bubble), minimum: TEXT_MIN },
    { what: 'filled link button label on hover', foreground: color('--cl-on-accent'), background: onTop(color('--cl-accent-hover'), bubble), minimum: TEXT_MIN },
    { what: 'visitor text', foreground: of('.cl-user_message', 'color'), background: onTop(of('.cl-user_message', 'background', '.cl-user_message', 'background-color'), listRgb), minimum: TEXT_MIN },
    { what: 'suggestion label', foreground: color('--cl-chip-ink'), background: chipBg, minimum: TEXT_MIN },
    { what: 'suggestion outline', foreground: color('--cl-chip-line'), background: listRgb, minimum: BOUNDARY_MIN },
    { what: 'feedback icons', foreground: paints(theme, token(theme, '--cl-feedback-ink') ?? '#9ca3af'), background: listRgb, minimum: ICON_MIN },
    { what: 'chosen thumbs up', foreground: paints(theme, token(theme, '--cl-feedback-up') ?? '#10b981'), background: listRgb, minimum: ICON_MIN },
    { what: 'typed text', foreground: of('.cl-input-element', 'color'), background: field, minimum: TEXT_MIN },
    {
      what: 'placeholder',
      foreground: paints(theme, declared([`.theme-${theme} .cl-input-element::placeholder`, 'color'], ['textarea::placeholder', 'color'])),
      background: field, minimum: TEXT_MIN,
    },
    { what: 'focused field border', foreground: color('--cl-accent'), background: [...bar, ...field], minimum: BOUNDARY_MIN },
    { what: 'send button', foreground: send, background: field, minimum: BOUNDARY_MIN },
    {
      what: 'send button on hover',
      foreground: paints(theme, declared([`.theme-${theme} .cl-send-button:hover`, 'background'], [`.theme-${theme} .cl-send-button`, 'background'], ['.cl-send-button', 'background-color'])),
      background: field, minimum: BOUNDARY_MIN,
    },
    { what: 'send icon', foreground: white, background: onTop(send, field), minimum: ICON_MIN },
    { what: 'launcher icon', foreground: white, background: onTop(launcher, [[255, 255, 255]]), minimum: ICON_MIN },
    {
      what: 'launcher icon on hover',
      foreground: white,
      background: onTop(paints(theme, declared([`.theme-${theme}.cl-trigger:hover`, 'background'], ['.cl-trigger:hover', 'background-color'])), [[255, 255, 255]]),
      minimum: ICON_MIN,
    },
    { what: 'AI notice', foreground: color('--cl-muted'), background: bar, minimum: TEXT_MIN },
    {
      what: 'error text and Try again',
      foreground: paints(theme, declared([`.theme-${theme} .cl-error_message`, '--cl-error-ink'], ['.cl-error_message', '--cl-error-ink'])),
      background: errorBg, minimum: TEXT_MIN,
    },
  ];
  // The session refresh card: the arc on the grey track and the light card (chatWindow).
  pairs.push({
    what: 'session refresh spinner arc', foreground: color('--cl-accent-on-light'),
    background: [[229, 231, 235], [243, 244, 246]], minimum: BOUNDARY_MIN,
  });
  return { list: listRgb, bar, field, bubble, header, send, pairs };
}

/** The lowest ratio of a pair: its worst stop on its worst backdrop. */
function worst(pair: Pair) {
  let lowest = { ratio: Infinity, foreground: '', background: '' };
  for (const background of pair.background) {
    for (const shown of onTop(pair.foreground, [background])) {
      const ratio = Math.round(contrastRatio(shown, background) * 100) / 100;
      if (ratio < lowest.ratio) lowest = { ratio, foreground: toHex(shown), background: toHex(background) };
    }
  }
  return lowest;
}

const AA_THEMES: ThemeName[] = ['default', 'dark', 'ocean', 'aurora', 'punku-ai-bookingkit'];

describe('built-in theme contrast (WCAG AA)', () => {
  it('reads the theme colours from the widget stylesheet', () => {
    expect(rules.length).toBeGreaterThan(100);
    expect(token('default', '--cl-accent')).toBe('#0969da');
  });

  describe.each(AA_THEMES)('the %s theme', (theme) => {
    const { pairs } = palette(theme);

    it.each(pairs.map((pair) => [pair.what, pair] as const))('%s', (_what, pair) => {
      const { ratio, foreground, background } = worst(pair);
      // A failure names the colours and the ratio.
      const result = ratio >= pair.minimum ? 'passes' : `${ratio}:1, below ${pair.minimum}:1`;
      expect(`${foreground} on ${background}: ${result}`).toBe(`${foreground} on ${background}: passes`);
    });

    it('needs no help from the contrast guard', () => {
      const { colors, pairs: guarded } = guardControlColors({ theme });
      expect(colors).toEqual({});
      expect(guarded.filter((pair) => pair.ratio < pair.minimum)).toEqual([]);
    });

    it('gives the contrast guard the colours of the stylesheet', () => {
      const colors = THEME_COLORS[theme];
      const { list, bar, bubble, header, send } = palette(theme);
      expect(colors.accent).toBe(token(theme, '--cl-accent'));
      expect(colors.onAccent).toBe(token(theme, '--cl-on-accent'));
      // The dark themes keep their mid accent for light surfaces; the others use the accent.
      expect(toHex(paints(theme, token(theme, '--cl-accent-on-light'))[0].rgb)).toBe(colors.accentOnLight ?? colors.accent);
      expect(colors.link).toBe(token(theme, '--cl-link'));
      expect(colors.muted).toBe(token(theme, '--cl-muted'));
      expect(colors.field).toBe(token(theme, '--cl-field'));
      expect(colors.chipInk).toBe(token(theme, '--cl-chip-ink'));
      expect(colors.chipLine).toBe(token(theme, '--cl-chip-line'));
      expect(list.map(toHex)).toContain(colors.list);
      expect(toHex(bar[0])).toBe(colors.fieldBackdrop);
      expect(header.map(toHex)).toEqual(colors.header);
      // The guard paints a translucent answer bubble on the list itself.
      expect(bubble.map(toHex)).toContain(toHex(paintOver(parseColor(colors.bubble)!.rgb, parseColor(colors.bubble)!.alpha, parseColor(colors.list)!.rgb)));
      // A gradient send button is null for the guard: it cannot be measured.
      expect(colors.send).toBe(send.length === 1 ? toHex(send[0].rgb) : null);
    });
  });

  it('draws the link button focus rings in the colours the contrast guard checks', () => {
    // The guard measures the filled ring as the fill (--cl-link-button-fill
    // where it changes the fill) and the outlined ring as the link colour.
    expect(declared(['.cl-window .cl-bot_message .markdown-body > p.cl-link-only a:focus-visible', 'outline']))
      .toBe('2px solid var(--cl-link-button-fill, var(--cl-accent))');
    expect(declared(['.cl-window .cl-bot_message .markdown-body li.cl-link-only a:focus-visible', 'outline']))
      .toBe('2px solid currentColor');
  });

  it('keeps the colours of the swarovski theme', () => {
    const { pairs } = palette('swarovski');
    const shown = Object.fromEntries(pairs.map((pair) => [pair.what, worst(pair).foreground]));
    expect(shown).toMatchObject({
      'visitor text': '#ffffff',
      'link in an answer': '#0969da',
      'filled link button': '#2563eb',
      'feedback icons': '#9ca3af',
      'chosen thumbs up': '#10b981',
      placeholder: '#9ca3af',
      'send button': '#3b82f6',
      'AI notice': '#64748b',
    });
    const backgrounds = Object.fromEntries(pairs.map((pair) => [pair.what, worst(pair).background]));
    expect(backgrounds).toMatchObject({ 'visitor text': '#3b82f6', 'answer text': '#e5e7eb', 'header title and icons': '#1a1a1a' });
    expect(declared(['.cl-window.theme-swarovski .cl-header .cl-header-subtitle', 'opacity'])).toBe('0.85');
  });
});
