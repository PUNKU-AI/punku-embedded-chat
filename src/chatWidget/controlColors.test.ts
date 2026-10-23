import { contrastRatio, mix, paintOver, parseColor, parseOpaqueColor, Rgb, toHex } from './colorContrast';
import {
  BOUNDARY_MIN, guardControlColors, guardFilled, guardOutline, guardOwnText, ICON_MIN, TEXT_MIN, THEME_COLORS,
  ThemeName,
} from './controlColors';

const rgb = (hex: string) => parseOpaqueColor(hex) as Rgb;
const ratio = (a: string, b: string) => contrastRatio(rgb(a), rgb(b));

describe('colour maths', () => {
  it('reads alpha from rgba() and 8-digit hex', () => {
    expect(parseColor('rgba(255, 228, 149, 0.4)')).toEqual({ rgb: [255, 228, 149], alpha: 0.4 });
    expect(parseColor('#ffffff80')?.alpha).toBeCloseTo(128 / 255, 5);
    expect(parseColor('linear-gradient(#fff, #000)')).toBeNull();
  });

  it('paints a transparent colour on its backdrop and mixes colours', () => {
    expect(paintOver([255, 255, 255], 0.5, [0, 0, 0])).toEqual([128, 128, 128]);
    expect(mix([0, 0, 0], [255, 255, 255], 0.2)).toEqual([51, 51, 51]);
    expect(toHex([9, 105, 218])).toBe('#0969da');
  });

  it('measures the cases from the review', () => {
    // The filled button in the same red as the bubble (castellodigropparello).
    expect(ratio('#9e183b', '#9e183b')).toBe(1);
    // The theme's blue links on Tiroler Abend's dark red.
    expect(ratio('#1d4ed8', '#791f0d')).toBeLessThan(2);
  });
});

describe('guardFilled', () => {
  const surface = rgb('#ffffff');

  it('keeps a fill and a label that already pass', () => {
    const result = guardFilled({ fill: rgb('#0969da'), label: rgb('#ffffff'), surface, labelMin: TEXT_MIN, own: true });
    expect(result).toEqual({ fill: rgb('#0969da'), label: rgb('#ffffff') });
  });

  it('takes the site link colour when the fill vanishes, and a label that reads on it', () => {
    const red = rgb('#9e183b');
    const result = guardFilled({
      fill: red, label: rgb('#ffffff'), surface: red, labelMin: TEXT_MIN, own: true, linkColor: rgb('#ffd700'),
    });
    expect(toHex(result.fill)).toBe('#ffd700');
    // White fails on gold; the bubble colour reads (5.6:1).
    expect(toHex(result.label)).toBe('#9e183b');
  });

  it('moves a site colour just enough and keeps its label when it can', () => {
    const bubble = rgb('#f0f7fa');
    const green = rgb('#38aa3f');
    expect(contrastRatio(green, bubble)).toBeLessThan(BOUNDARY_MIN);
    const result = guardFilled({ fill: green, label: rgb('#ffffff'), surface: bubble, labelMin: TEXT_MIN, own: true });
    expect(contrastRatio(result.fill, bubble)).toBeGreaterThanOrEqual(BOUNDARY_MIN);
    expect(toHex(result.label)).toBe('#ffffff');
    expect(contrastRatio(result.label, result.fill)).toBeGreaterThanOrEqual(TEXT_MIN);
    // Still a green: the blue channel stays the lowest.
    expect(result.fill[1]).toBeGreaterThan(result.fill[2]);
  });

  it('gives a theme colour the theme fallback, else white or black', () => {
    const bubble = rgb('#791f0d');
    const result = guardFilled({
      fill: rgb('#0969da'), label: rgb('#ffffff'), surface: bubble, labelMin: TEXT_MIN, own: false,
      themeFallback: rgb('#1d4ed8'),
    });
    expect(toHex(result.fill)).toBe('#ffffff');
    expect(toHex(result.label)).toBe('#791f0d');
  });

  it('accepts 3:1 for an icon label', () => {
    const result = guardFilled({
      fill: rgb('#0ea5e9'), label: rgb('#ffffff'), surface: rgb('#111c30'), labelMin: ICON_MIN, own: false,
    });
    expect(toHex(result.fill)).toBe('#0ea5e9');
    expect(contrastRatio(result.label, result.fill)).toBeGreaterThanOrEqual(ICON_MIN);
  });
});

describe('guardOwnText and guardOutline', () => {
  it('keeps a site link colour from 3:1 and moves one below it to 4.5:1', () => {
    expect(toHex(guardOwnText(rgb('#dd4a97'), rgb('#ffffff'), null))).toBe('#dd4a97');
    const gold = guardOwnText(rgb('#c69300'), rgb('#ffffff'), rgb('#2a2a2a'));
    expect(contrastRatio(gold, rgb('#ffffff'))).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(toHex(gold)).not.toBe('#2a2a2a');
  });

  it('replaces an outline below 3:1 with the link colour, the label, or white/black', () => {
    const list = rgb('#33a1e6');
    expect(toHex(guardOutline(rgb('#1d4ed8'), list, null, rgb('#1d4ed8')))).toBe('#000000');
    expect(toHex(guardOutline(rgb('#bfd3fb'), rgb('#f8fafc'), null, rgb('#1d4ed8')))).toBe('#1d4ed8');
  });
});

describe('guardControlColors', () => {
  it.each(Object.keys(THEME_COLORS) as ThemeName[])('lets every control of the %s theme pass on its own', (theme) => {
    const { pairs } = guardControlColors({ theme });
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect({ ...pair, passes: pair.ratio >= pair.minimum }).toMatchObject({ passes: true });
    }
  });

  it('gives a filled link button in the bubble colour the site link colour', () => {
    const { colors } = guardControlColors({
      theme: 'default', button_color: '#9e183b', button_text_color: '#ffffff', bot_message_color: '#9e183b',
      bot_message_text_color: '#ffffff', link_color: '#FFD700',
    });
    expect(colors).toMatchObject({ linkButtonFill: '#ffd700', linkButtonLabel: '#9e183b' });
    // The site link colour reads on the bubble and stays.
    expect(colors.link).toBeUndefined();
  });

  it('lets links take the text colour on dark red, and makes the filled button white', () => {
    const { colors } = guardControlColors({
      theme: 'default', bot_message_color: '#791f0d', bot_message_text_color: '#ffffff',
    });
    expect(colors).toMatchObject({ linksTakeTextColor: true, linkButtonFill: '#ffffff', linkButtonLabel: '#791f0d' });
  });

  it('keeps every colour of a configuration that already reads', () => {
    const { colors } = guardControlColors({
      theme: 'default', bot_message_color: '#EAF1FF', bot_message_text_color: '#111827', link_color: '#2760CF',
    });
    expect(colors).toEqual({});
  });

  it('leaves colours alone that it cannot read', () => {
    const { colors } = guardControlColors({
      theme: 'default', button_color: 'linear-gradient(#fff, #000)', link_color: 'gold',
      send_button_style: { background: 'linear-gradient(135deg, #00496F 0%, #246479 100%)' },
    });
    expect(colors.linkButtonFill).toBeUndefined();
    expect(colors.link).toBeUndefined();
    expect(colors.sendFill).toBeUndefined();
  });

  it('makes a light grey send button visible in a white field', () => {
    const { colors, pairs } = guardControlColors({
      theme: 'default', send_button_style: { backgroundColor: '#DDDDDD' }, send_icon_style: { stroke: '#333333' },
    });
    expect(colors.sendFill).toBeDefined();
    const send = pairs.find((pair) => pair.control === 'send button')!;
    expect(send.ratio).toBeGreaterThanOrEqual(BOUNDARY_MIN);
  });

  it('gives "Try again" a readable label on the classic red error box', () => {
    const { colors, pairs } = guardControlColors({ theme: 'default', error_message_style: { color: '#ffffff' } });
    expect(colors.retryLabel).toBe('#000000');
    expect(pairs.find((pair) => pair.control === 'try again label')!.ratio).toBeGreaterThanOrEqual(TEXT_MIN);
  });
});
