import { BLACK, contrastRatio, mix, paintOver, parseColor, parseOpaqueColor, Rgb, toHex, WHITE } from './colorContrast';
import {
  BOUNDARY_MIN, guardControlColors, guardDialogConfirm, guardFilled, guardHintColors, guardOutline, guardOwnText, ICON_MIN,
  TEXT_MIN, THEME_COLORS, ThemeName,
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
  it('keeps a site link colour from 4.5:1 and moves one below it just enough', () => {
    expect(toHex(guardOwnText(rgb('#075985'), rgb('#ffffff'), null))).toBe('#075985');
    // Link text needs 4.5:1, also between 3:1 and 4.5:1 (pink on white, 3.8:1).
    const pink = guardOwnText(rgb('#dd4a97'), rgb('#ffffff'), null);
    expect(contrastRatio(pink, rgb('#ffffff'))).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(contrastRatio(pink, rgb('#ffffff'))).toBeLessThan(5.5);
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

  it('gives links a shade of the bubble where the answer text fails too', () => {
    // White text on a mid green reads at 3:1 only. The site's text stays.
    const { colors, pairs } = guardControlColors({
      theme: 'default', bot_message_color: '#3aaa35', bot_message_text_color: '#ffffff',
    });
    expect(colors.linksTakeTextColor).toBe(true);
    const link = rgb(colors.link!);
    expect(contrastRatio(link, rgb('#3aaa35'))).toBeGreaterThanOrEqual(TEXT_MIN);
    // A dark green: the green channel stays the highest.
    expect(link[1]).toBeGreaterThan(Math.max(link[0], link[2]));
    expect(pairs.find((pair) => pair.control === 'link')!.minimum).toBe(TEXT_MIN);
  });

  it('moves a site link colour between 3:1 and 4.5:1 to 4.5:1', () => {
    const { colors } = guardControlColors({
      theme: 'dark', bot_message_color: '#1F2937', bot_message_text_color: '#F9FAFB', link_color: '#3F9B47',
    });
    expect(contrastRatio(rgb('#3F9B47'), rgb('#1F2937'))).toBeLessThan(TEXT_MIN);
    expect(contrastRatio(rgb(colors.link!), rgb('#1F2937'))).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('makes the AI notice readable on a site input bar', () => {
    for (const background of ['#33a1e6', '#f1efee']) {
      const { colors, pairs } = guardControlColors({ theme: 'default', background_color: background });
      expect(contrastRatio(rgb(THEME_COLORS.default.muted), rgb(background))).toBeLessThan(TEXT_MIN);
      expect(contrastRatio(rgb(colors.noticeInk!), rgb(background))).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(pairs.find((pair) => pair.control === 'AI notice')!.ratio).toBeGreaterThanOrEqual(TEXT_MIN);
    }
    // input_container_style colours the bar when background_color is not set.
    const { colors } = guardControlColors({ theme: 'default', input_container_style: { backgroundColor: '#33a1e6' } });
    expect(colors.noticeInk).toBeDefined();
    // A gradient on the bar: the notice stays as it is.
    const gradient = guardControlColors({
      theme: 'default', input_container_style: { background: 'linear-gradient(#33a1e6, #33a1e6)' },
    });
    expect(gradient.colors.noticeInk).toBeUndefined();
  });

  it('measures the AI notice on a translucent input bar over the theme window', () => {
    // Half white over the dark window (#030712): the grey notice would read at 1.5:1.
    const { colors, pairs } = guardControlColors({
      theme: 'dark', input_container_style: { backgroundColor: 'rgba(255, 255, 255, 0.5)' },
    });
    expect(colors.noticeInk).toBeDefined();
    expect(pairs.find((pair) => pair.control === 'AI notice')!.ratio).toBeGreaterThanOrEqual(TEXT_MIN);
    // The light Bookingkit window has no colour of its own: the page shows through.
    const light = guardControlColors({
      theme: 'punku-ai-bookingkit', input_container_style: { backgroundColor: 'rgba(255, 255, 255, 0.5)' },
    });
    expect(light.colors.noticeInk).toBeUndefined();
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

  it('keeps a send button in the colour of the field as an icon-only button', () => {
    // The swarovski embed: a white button with a black paper plane in a white field.
    const { colors, pairs } = guardControlColors({
      theme: 'swarovski', send_button_style: { backgroundColor: '#FFFFFF' }, send_icon_style: { stroke: '#000000' },
    });
    expect(colors.sendFill).toBeUndefined();
    expect(colors.sendIcon).toBeUndefined();
    expect(pairs.find((pair) => pair.control === 'send button')).toBeUndefined();
    expect(pairs.find((pair) => pair.control === 'send button icon')).toMatchObject({ background: '#ffffff', ratio: 21 });
  });

  it('gives an icon-only send button an icon that reads on the field', () => {
    const { colors, pairs } = guardControlColors({
      theme: 'default', send_button_style: { backgroundColor: '#ffffff' }, send_icon_style: { stroke: '#f1f5f9' },
    });
    expect(colors.sendFill).toBeUndefined();
    expect(colors.sendIcon).toBe('#000000');
    expect(pairs.find((pair) => pair.control === 'send button icon')!.ratio).toBeGreaterThanOrEqual(ICON_MIN);
  });

  it('measures a translucent label on the new fill and sets it opaque', () => {
    const { colors, pairs } = guardControlColors({
      theme: 'default', button_color: '#9e183b', button_text_color: 'rgba(0, 0, 0, 0.2)',
      bot_message_color: '#9e183b', bot_message_text_color: '#ffffff', link_color: '#FFD700',
    });
    expect(colors.linkButtonFill).toBe('#ffd700');
    // 20% black on gold would read at about 1.6:1: the label is set explicitly.
    expect(colors.linkButtonLabel).toBeDefined();
    expect(pairs.find((pair) => pair.control === 'filled link button label')!.ratio).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('measures a translucent input field on the input bar that background_color paints', () => {
    const { colors, pairs } = guardControlColors({
      theme: 'default', background_color: '#000000', input_style: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
      send_button_style: { backgroundColor: '#000000' },
    });
    // The field is near #1a1a1a, not white: the black send button would vanish.
    expect(colors.sendFill).toBeDefined();
    expect(pairs.find((pair) => pair.control === 'send button')!.ratio).toBeGreaterThanOrEqual(BOUNDARY_MIN);
  });

  it('leaves the bubble unmeasured under a background image, even with a background colour', () => {
    const { colors, pairs } = guardControlColors({
      theme: 'default', button_color: '#9e183b', link_color: '#FFD700', bot_message_color: '#9e183b',
      bot_message_style: { background: 'linear-gradient(#ffffff, #ffffff)', backgroundColor: '#9e183b' },
    });
    expect(colors.linkButtonFill).toBeUndefined();
    expect(pairs.some((pair) => pair.control.startsWith('filled link button'))).toBe(false);
  });

  it('leaves a send button with a background image as it is, even with a background colour', () => {
    const { colors } = guardControlColors({
      theme: 'default',
      send_button_style: { background: 'linear-gradient(#dddddd, #dddddd)', backgroundColor: '#dddddd' },
    });
    expect(colors.sendFill).toBeUndefined();
  });

  it('gives "Try again" a readable label on the classic red error box', () => {
    const { colors, pairs } = guardControlColors({ theme: 'default', error_message_style: { color: '#ffffff' } });
    expect(colors.retryLabel).toBe('#000000');
    expect(pairs.find((pair) => pair.control === 'try again label')!.ratio).toBeGreaterThanOrEqual(TEXT_MIN);
  });
});

describe('guardHintColors', () => {
  it('keeps hint colours that read, and the stylesheet colours', () => {
    expect(guardHintColors('#FFF7D6', '#4A4A4A')).toEqual({});
    expect(guardHintColors('#111111', '#ffffff')).toEqual({});
    expect(guardHintColors(undefined, '#2a3849')).toEqual({});
    expect(guardHintColors()).toEqual({});
  });

  it('darkens a site background just enough for its white text', () => {
    // White on #3F9B47 reads at 3.5:1.
    const result = guardHintColors('#3F9B47', '#FFFFFF');
    expect(result.text).toBeUndefined();
    const background = rgb(result.background!);
    expect(contrastRatio(rgb('#ffffff'), background)).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(contrastRatio(rgb('#ffffff'), background)).toBeLessThan(5.5);
    expect(background[1]).toBeGreaterThan(Math.max(background[0], background[2]));
  });

  it('keeps a site colour and changes only the stylesheet colour', () => {
    // A dark site background without a text colour: the dark default text turns white.
    expect(guardHintColors('#123456')).toEqual({ text: '#ffffff' });
    // A light site text colour without a background: the white hint turns dark.
    expect(guardHintColors(undefined, '#abcdef')).toEqual({ background: '#111827' });
    expect(guardHintColors(undefined, '#ffffff')).toEqual({ background: '#111827' });
  });

  it('gives the text white or black when the site background cannot keep it', () => {
    // A grey text on a mid grey: no small move of the grey reaches 4.5:1.
    expect(guardHintColors('#808080', '#888888')).toEqual({ text: '#000000' });
    // A faint text colour reads on no background: it turns opaque.
    expect(guardHintColors(undefined, 'rgba(255, 255, 255, 0.1)')).toEqual({ text: '#000000' });
  });

  it('leaves a transparent background or a colour name as it is', () => {
    expect(guardHintColors('rgba(0, 0, 0, 0.5)', '#777777')).toEqual({});
    expect(guardHintColors('green', '#ffffff')).toEqual({});
  });
});

// The header icon sits on the header without a plate. It gets a plate only
// where its colour would vanish on the header (WCAG 1.4.11, 3:1).
describe('guardDialogConfirm', () => {
  it('keeps the stylesheet red #dc2626 for white text', () => {
    expect(guardDialogConfirm()).toEqual({});
    expect(guardDialogConfirm('#FFFFFF')).toEqual({});
    expect(ratio('#ffffff', '#dc2626')).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('keeps the lighter red #ef4444 for a dark site text that reads on it', () => {
    // A saved customer sets button_text_color #1C1C1C without button_color:
    // 4.5:1 on #ef4444 (v1.0.24), but below that on #dc2626.
    expect(ratio('#1c1c1c', '#dc2626')).toBeLessThan(TEXT_MIN);
    expect(guardDialogConfirm('#1C1C1C')).toEqual({ fill: '#ef4444' });
    expect(ratio('#1c1c1c', '#ef4444')).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it('gives a text that reads on neither red white or black', () => {
    expect(guardDialogConfirm('#888888')).toEqual({ label: '#ffffff' });
  });

  it('reads white and black by name', () => {
    expect(guardDialogConfirm('white')).toEqual({});
    // Black reads at 5.6:1 on #ef4444 (v1.0.24), at 4.35:1 on #dc2626.
    expect(ratio('#000000', '#dc2626')).toBeLessThan(TEXT_MIN);
    expect(guardDialogConfirm('Black')).toEqual({ fill: '#ef4444' });
  });

  it('keeps the red of v1.0.24 for a text colour it cannot read', () => {
    expect(guardDialogConfirm('navy')).toEqual({ fill: '#ef4444' });
    expect(guardDialogConfirm('hsl(0 0% 10%)')).toEqual({ fill: '#ef4444' });
  });
});

describe('dark themes on a light site bubble', () => {
  // The dark themes fill link buttons in their light link colour, which
  // vanishes on a white bubble. Their mid accent with white text reads there,
  // as on v1.0.24.
  it.each([['dark', '#5558e8'], ['ocean', '#0369a1'], ['aurora', '#7c3aed']] as const)(
    'gives a %s link button its mid accent %s with white text', (theme, accent) => {
      const { colors, pairs } = guardControlColors({ theme, bot_message_color: '#ffffff' });
      expect(colors).toMatchObject({ linkButtonFill: accent, linkButtonLabel: '#ffffff' });
      expect(pairs.filter((pair) => pair.ratio < pair.minimum)).toEqual([]);
    },
  );
});

describe('link button focus marks', () => {
  const focusMarks = (props: Parameters<typeof guardControlColors>[0]) => Object.fromEntries(
    guardControlColors(props).pairs
      .filter((pair) => pair.control.endsWith('focus mark'))
      .map((pair) => [pair.control, pair]),
  );

  // The dark themes on a white site bubble: the theme accent (the old ring
  // colour) reads at about 2:1 there. The ring takes the guarded fill.
  it.each([['dark', '#a5b4fc', '#5558e8'], ['ocean', '#7dd3fc', '#0369a1'], ['aurora', '#f0abfc', '#7c3aed']] as const)(
    'draws the %s ring in the fill, not the light accent', (theme, oldRing, fill) => {
      expect(ratio(oldRing, '#ffffff')).toBeLessThan(BOUNDARY_MIN);
      const marks = focusMarks({ theme, bot_message_color: '#ffffff' });
      expect(marks['filled link button focus mark']).toMatchObject({ foreground: fill, background: '#ffffff' });
      expect(marks['filled link button focus mark'].ratio).toBeGreaterThanOrEqual(BOUNDARY_MIN);
      expect(marks['outlined link button focus mark'].ratio).toBeGreaterThanOrEqual(BOUNDARY_MIN);
    },
  );

  it('draws the rings in a site button colour and link colour', () => {
    const marks = focusMarks({ button_color: '#9e183b', bot_message_color: '#9e183b', bot_message_text_color: '#ffffff', link_color: '#FFD700' });
    // The fill in the bubble colour falls back to the gold link colour.
    expect(marks['filled link button focus mark']).toMatchObject({ foreground: '#ffd700', background: '#9e183b' });
    expect(marks['outlined link button focus mark']).toMatchObject({ foreground: '#ffd700', background: '#9e183b' });
  });
});

describe('header subtitle with button_color', () => {
  it.each([
    // 85% of the site's text colour reads at 4.5:1: the subtitle keeps it.
    ['white on dark red', '#9e183b', '#ffffff', undefined],
    ['white on slate', '#2E3440', undefined, undefined],
    ['black on orange', '#ff8000', '#000000', undefined],
    // 85% white on a mid green falls below 4.5:1: full opacity reads better.
    ['white on mid green', '#3F9B47', '#FFFFFF', true],
  ])('%s', (_case, button_color, button_text_color, opaque) => {
    expect(guardControlColors({ button_color, button_text_color }).colors.subtitleOpaque).toBe(opaque);
  });

  it('keeps the 85% subtitle of the swarovski theme', () => {
    expect(guardControlColors({ theme: 'swarovski', button_color: '#3F9B47' }).colors.subtitleOpaque).toBeUndefined();
  });

  it('leaves the theme headers to the stylesheet', () => {
    for (const theme of Object.keys(THEME_COLORS)) {
      expect(guardControlColors({ theme }).colors.subtitleOpaque).toBeUndefined();
    }
  });
});

describe('header icon plate', () => {
  const headerIcon = (props: Parameters<typeof guardControlColors>[0]) => {
    const { colors, pairs } = guardControlColors(props);
    return { plate: colors.headerIconPlate, pair: pairs.find((pair) => pair.control === 'header icon') };
  };

  it.each(Object.keys(THEME_COLORS) as ThemeName[])('needs no plate in the %s theme', (theme) => {
    const { plate, pair } = headerIcon({ theme });
    expect(plate).toBeUndefined();
    expect(pair!.ratio).toBeGreaterThanOrEqual(ICON_MIN);
  });

  it('measures the stop of a gradient header where the icon reads worst', () => {
    // Aurora: white reads worst on the pink end (#db2777).
    expect(headerIcon({ theme: 'aurora' }).pair).toMatchObject({ foreground: '#ffffff', background: '#db2777' });
  });

  it('needs no plate where button_text_color reads on button_color', () => {
    expect(headerIcon({ button_color: '#9e183b', button_text_color: '#ffffff' }).plate).toBeUndefined();
    expect(headerIcon({ theme: 'dark', button_color: '#ff8000', button_text_color: '#000000' }).plate).toBeUndefined();
  });

  it('puts a white icon on a white header on a grey plate', () => {
    const { plate, pair } = headerIcon({ button_color: '#ffffff' });
    // The smallest 5% step toward black that reaches 3:1 (3.4:1). One step
    // less reads at 2.8:1.
    expect(plate).toBe(toHex(mix(WHITE, BLACK, 0.45)));
    expect(contrastRatio(WHITE, mix(WHITE, BLACK, 0.4))).toBeLessThan(ICON_MIN);
    expect(pair).toMatchObject({ foreground: '#ffffff', background: plate, minimum: ICON_MIN });
    expect(pair!.ratio).toBeGreaterThanOrEqual(ICON_MIN);
  });

  it('puts a red icon on a red header on a light shade of the red', () => {
    const { plate } = headerIcon({ button_color: '#c81e1e', button_text_color: '#c81e1e' });
    expect(ratio('#c81e1e', plate!)).toBeGreaterThanOrEqual(ICON_MIN);
    // A shade of the header colour: red stays the strongest channel.
    const [r, g, b] = rgb(plate!);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('darkens a mid-tone header behind a white icon', () => {
    // White on #f2b705 (yellow) reads at about 1.8:1.
    const { plate } = headerIcon({ button_color: '#f2b705' });
    expect(ratio('#ffffff', plate!)).toBeGreaterThanOrEqual(ICON_MIN);
    expect(contrastRatio(rgb(plate!), BLACK)).toBeLessThan(ratio('#f2b705', '#000000'));
  });

  it('measures a translucent icon colour on the plate it shows through', () => {
    const { plate, pair } = headerIcon({ button_color: '#ffffff', button_text_color: 'rgba(255, 255, 255, 0.8)' });
    expect(plate).toBeDefined();
    expect(pair!.ratio).toBeGreaterThanOrEqual(ICON_MIN);
    // A nearly transparent icon takes the colour of any plate: no plate helps.
    expect(headerIcon({ button_color: '#ffffff', button_text_color: 'rgba(0, 0, 0, 0.1)' }).plate).toBeUndefined();
  });

  it('leaves a header colour that it cannot read as it is', () => {
    expect(headerIcon({ button_color: 'white' })).toEqual({ plate: undefined, pair: undefined });
    expect(headerIcon({ button_color: 'rgba(255, 255, 255, 0.5)' })).toEqual({ plate: undefined, pair: undefined });
    expect(headerIcon({ button_color: '#ffffff', button_text_color: 'white' })).toEqual({ plate: undefined, pair: undefined });
  });
});
