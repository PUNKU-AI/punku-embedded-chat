import { BLACK, contrastRatio, mix, paintOver, parseColor, parseOpaqueColor, Rgb, toHex, WHITE } from './colorContrast';
import {
  BOUNDARY_MIN, cardMetaColor, guardControlColors, guardDialogConfirm, guardFilled, guardHintColors, guardOutline,
  cardSurface, guardOwnText, hoverShade, ICON_MIN, siteFilled, TEXT_MIN, THEME_COLORS, ThemeName,
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

describe('siteFilled', () => {
  const white = { rgb: WHITE, alpha: 1 };
  const site = (color: string, surface: string | string[], labels = [white]) => {
    const surfaces = (Array.isArray(surface) ? surface : [surface]).map(rgb);
    const result = siteFilled(rgb(color), labels, surfaces, TEXT_MIN);
    return result && { fill: toHex(result.fill), label: toHex(result.label) };
  };

  it('keeps a site colour and its label that read', () => {
    expect(site('#075985', '#ffffff')).toEqual({ fill: '#075985', label: '#ffffff' });
  });

  it('makes a site colour a little darker so that its label still reads', () => {
    // White on the pink reads at 3.8:1. 10% darker, it reads at 4.6:1.
    expect(ratio('#ffffff', '#dd4a97')).toBeLessThan(TEXT_MIN);
    expect(site('#dd4a97', '#ffffff')).toEqual({ fill: toHex(mix(rgb('#dd4a97'), BLACK, 0.1)), label: '#ffffff' });
  });

  it('keeps a dark site label on a mid gold, a little darker for 3:1', () => {
    // The gold reads at 2.6:1 on white; 5% darker, at 3:1.
    expect(ratio('#c69300', '#ffffff')).toBeLessThan(BOUNDARY_MIN);
    const dark = { rgb: rgb('#1c1c1c'), alpha: 1 };
    expect(site('#c69300', '#ffffff', [dark, white])).toEqual({ fill: toHex(mix(rgb('#c69300'), BLACK, 0.05)), label: '#1c1c1c' });
  });

  it('gives no fill for a pale colour that would need a black label', () => {
    // Before, #93c5fd became a dull #6e94be with a black label at 3.16:1.
    for (const pale of ['#93c5fd', '#c4b5fd', '#f0a0c0', '#60a5fa', '#d4a853', '#23beef']) {
      expect(site(pale, '#ffffff')).toBeNull();
    }
  });

  it('takes the theme label where white does not read', () => {
    // The ocean theme's dark label on a light site blue.
    expect(site('#0ea5e9', ['#1e293b', '#1f3550'], [white, { rgb: rgb('#082f49'), alpha: 1 }]))
      .toEqual({ fill: '#0ea5e9', label: '#082f49' });
  });

  it('checks the colour on every surface: the bubble and the card', () => {
    // The green reads on the near-black bubble (3.5:1), not on the lighter card.
    const card = toHex(mix(rgb('#111827'), WHITE, 0.08));
    expect(site('#15803d', ['#111827', card])).toEqual({ fill: toHex(mix(rgb('#15803d'), WHITE, 0.05)), label: '#ffffff' });
  });

  it('moves a site colour at most a quarter of the way to black or white', () => {
    // The bubble's own green needs more than half the way to reach 3:1.
    expect(site('#3aaa35', '#3aaa35')).toBeNull();
    // A dark green on that bubble needs 15% only.
    expect(site('#046035', '#3aaa35')).toEqual({ fill: toHex(mix(rgb('#046035'), BLACK, 0.15)), label: '#ffffff' });
  });
});

describe('hoverShade', () => {
  it('makes a fill 10% darker while it and its label still read', () => {
    expect(toHex(hoverShade(rgb('#c74388'), WHITE, [rgb('#ffffff')]))).toBe(toHex(mix(rgb('#c74388'), BLACK, 0.1)));
  });

  it('makes a fill lighter where darker would not read', () => {
    // A dark label on a light blue in a dark bubble: darker would fail.
    const shade = hoverShade(rgb('#0ea5e9'), rgb('#082f49'), [rgb('#1e293b')]);
    expect(toHex(shade)).toBe(toHex(mix(rgb('#0ea5e9'), WHITE, 0.1)));
  });

  it('keeps the fill where no shade reads', () => {
    const fill = mix(rgb('#15803d'), WHITE, 0.05);
    expect(hoverShade(fill, WHITE, [rgb('#111827'), mix(rgb('#111827'), WHITE, 0.08)])).toEqual(fill);
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
    // The site's answer colour gives the checkout card its own surface. The
    // filled link button takes the site's link colour, with a hover shade of
    // it; no colour is changed for readability.
    expect(colors).toEqual({
      linkButtonFill: '#2760cf', linkButtonHover: toHex(mix(rgb('#2760cf'), BLACK, 0.1)),
      cardSurface: 'custom', cardBg: expect.any(String), cardMeta: expect.any(String),
    });
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

// Without button_color, filled link buttons and the checkout card button
// follow the site's own colours: link_color, then the send button, then the
// visitor bubbles, each as it is or a little darker or lighter. The colour
// sets come from real staging embeds (not named: the repository is public).
describe('link buttons in the site colours', () => {
  const SITE_SETS: Array<[string, Parameters<typeof guardControlColors>[0], string, string]> = [
    // Before: the theme blue #0969da on every white bubble.
    ['a gold link colour and a dark button text', {
      button_text_color: '#1C1C1C', background_color: '#FAFAF8', bot_message_color: '#FFFFFF', bot_message_text_color: '#2A2A2A',
      link_color: '#C69300', send_button_style: { backgroundColor: '#F2B705' }, user_message_color: '#FFF2CC',
    }, '#bc8c00', '#1c1c1c'],
    ['a pink link colour', {
      link_color: '#dd4a97', send_button_style: { backgroundColor: '#dd4a97' }, user_message_color: '#ed719e',
    }, '#c74388', '#ffffff'],
    ['a dark blue link colour', {
      link_color: '#075985', send_button_style: { backgroundColor: '#075985' }, user_message_color: '#075985',
    }, '#075985', '#ffffff'],
    ['a blue link colour on light blue answers', {
      button_text_color: '#FFFFFF', background_color: '#FFFFFF', bot_message_color: '#EAF1FF', bot_message_text_color: '#111827',
      link_color: '#2760CF', user_message_color: '#2760CF',
    }, '#2760cf', '#ffffff'],
    // Before: black. The send button has the bubble colour; the dark green
    // visitor bubbles win, 15% darker.
    ['a dark green visitor colour on mid green answers', {
      button_text_color: '#ffffff', background_color: '#f1efee', bot_message_color: '#3aaa35', bot_message_text_color: '#ffffff',
      send_button_style: { backgroundColor: '#3aaa35' }, user_message_color: '#046035',
    }, '#03522d', '#ffffff'],
    ['a navy send button without a link colour', {
      background_color: '#33a1e6', send_button_style: { backgroundColor: '#2a3849' }, user_message_color: '#2a3849',
    }, '#2a3849', '#ffffff'],
    // The real snippet: a gradient send button and gradient visitor bubbles
    // over user_message_color. The send gradient's first stop wins.
    ['a gradient send button and gradient visitor bubbles', {
      send_button_style: { background: 'linear-gradient(135deg, #00496F 0%, #246479 100%)' }, user_message_color: '#003a5d',
      user_message_style: { background: 'linear-gradient(135deg, #00496F 0%, #246479 100%)', color: '#FFFFFF' },
    }, '#00496f', '#ffffff'],
    // With button_color, nothing changes: the gold link colour, as before.
    ['button_color in the bubble colour', {
      button_color: '#9e183b', button_text_color: '#ffffff', background_color: '#ffffff', bot_message_color: '#9e183b',
      bot_message_text_color: '#ffffff', link_color: '#FFD700', send_button_style: { backgroundColor: '#9e183b' },
    }, '#ffd700', '#9e183b'],
  ];

  it.each(SITE_SETS)('fills the link button and the card button for %s', (_name, props, fill, label) => {
    const { pairs } = guardControlColors({ theme: 'default', ...props });
    const pair = (control: string) => pairs.find((item) => item.control === control)!;
    expect(pair('filled link button')).toMatchObject({ foreground: fill });
    expect(pair('filled link button label')).toMatchObject({ foreground: label, background: fill });
    // The card is the same colour or lighter: the button keeps its fill there.
    expect(pair('checkout card button')).toMatchObject({ foreground: fill });
    expect(pair('checkout card button label')).toMatchObject({ foreground: label });
    expect(pairs.filter((item) => item.ratio < item.minimum)).toEqual([]);
  });

  it('takes the link colour first, then the send button, then the visitor bubbles', () => {
    const fill = (props: Parameters<typeof guardControlColors>[0]) => guardControlColors(props).colors.linkButtonFill;
    const send = { send_button_style: { backgroundColor: '#075985' } };
    expect(fill({ link_color: '#2a3849', ...send, user_message_color: '#003a5d' })).toBe('#2a3849');
    expect(fill({ ...send, user_message_color: '#003a5d' })).toBe('#075985');
    expect(fill({ user_message_color: '#003a5d' })).toBe('#003a5d');
    expect(fill({ user_message_style: { backgroundColor: '#003a5d' } })).toBe('#003a5d');
    // A gold link colour needs more than a small move on white: the next colour wins.
    expect(fill({ link_color: '#FFD700', user_message_color: '#003a5d' })).toBe('#003a5d');
    // A gradient gives its first colour stop, on a visitor bubble and a send button.
    expect(fill({ user_message_color: '#003a5d', user_message_style: { background: 'linear-gradient(#2a3849, #003a5d)' } }))
      .toBe('#2a3849');
    expect(fill({ send_button_style: { background: 'linear-gradient(90deg, rgb(7, 89, 133), #2a3849)' } })).toBe('#075985');
    // Behind a gradient with no stop the widget can read, or an image, user_message_color comes next.
    expect(fill({ user_message_color: '#003a5d', user_message_style: { background: 'linear-gradient(navy, teal)' } })).toBe('#003a5d');
    expect(fill({ user_message_color: '#003a5d', user_message_style: { background: 'url(bubble.png)' } })).toBe('#003a5d');
    // A pale first stop goes on to user_message_color.
    expect(fill({ user_message_color: '#003a5d', user_message_style: { background: 'linear-gradient(#e0f2fe, #003a5d)' } }))
      .toBe('#003a5d');
  });

  it('keeps the theme colours of the swarovski theme, which shows text links', () => {
    const { colors } = guardControlColors({
      theme: 'swarovski', link_color: '#075985', send_button_style: { backgroundColor: '#2a3849' }, user_message_color: '#003a5d',
    });
    expect(colors.linkButtonFill).toBeUndefined();
    expect(colors.cardButtonFill).toBeUndefined();
  });

  it('keeps one site colour for the link button and the card button', () => {
    // The green reads on the near-black bubble (3.5:1), not on the lighter
    // card (2.9:1). 5% lighter, it reads on both: one colour for both buttons.
    const { colors, pairs } = guardControlColors({ link_color: '#15803d', bot_message_color: '#111827', bot_message_text_color: '#ffffff' });
    expect(colors.linkButtonFill).toBe(toHex(mix(rgb('#15803d'), WHITE, 0.05)));
    expect(colors.cardButtonFill).toBeUndefined();
    expect(pairs.find((pair) => pair.control === 'checkout card button')!.ratio).toBeGreaterThanOrEqual(BOUNDARY_MIN);
    expect(pairs.filter((pair) => pair.ratio < pair.minimum)).toEqual([]);
  });

  it('keeps the theme accent where a pale site colour would need a black label', () => {
    // Saved embeds with a pale send button, and pale visitor colours.
    for (const props of [
      { send_button_style: { backgroundColor: '#d4a853' } }, { send_button_style: { backgroundColor: '#23beef' } },
      { user_message_color: '#93c5fd' }, { user_message_color: '#c4b5fd' }, { user_message_color: '#f0a0c0' },
    ]) {
      const { colors } = guardControlColors({ theme: 'default', ...props });
      expect([colors.linkButtonFill, colors.linkButtonLabel, colors.linkButtonHover]).toEqual([undefined, undefined, undefined]);
    }
  });

  it('checks a translucent visitor colour as it shows on the message list', () => {
    // 60% blue on the dark list shows #1d459d; on the white bubble it would be pale.
    const { colors } = guardControlColors({
      background_color: '#111827', bot_message_color: '#ffffff', bot_message_text_color: '#111111',
      user_message_color: 'rgba(37, 99, 235, 0.6)',
    });
    expect(colors.linkButtonFill).toBe(toHex(paintOver(rgb('#2563eb'), 0.6, rgb('#111827'))));
    expect(colors.linkButtonLabel).toBeUndefined();
  });

  it('checks a translucent send colour as it shows on the input field', () => {
    const { colors } = guardControlColors({ send_button_style: { backgroundColor: 'rgba(7, 89, 133, 0.9)' } });
    expect(colors.linkButtonFill).toBe(toHex(paintOver(rgb('#075985'), 0.9, rgb('#ffffff'))));
  });
});

describe('link buttons in the site colours on the dark themes', () => {
  const result = (props: Parameters<typeof guardControlColors>[0]) => {
    const { colors, pairs } = guardControlColors(props);
    const pair = (control: string) => pairs.find((item) => item.control === control)!;
    return {
      colors, fill: pair('filled link button').foreground, label: pair('filled link button label').foreground,
      card: pair('checkout card button').foreground, cardLabel: pair('checkout card button label').foreground,
      failing: pairs.filter((item) => item.ratio < item.minimum),
    };
  };

  it.each([['dark', '#a5b4fc', '#1e1b4b'], ['ocean', '#7dd3fc', '#082f49'], ['aurora', '#f0abfc', '#3b0764']] as const)(
    'keeps the %s accent where a dark site colour does not read on the dark bubble', (theme, accent, onAccent) => {
      const { colors, fill, label, card, cardLabel, failing } = result({ theme, link_color: '#075985' });
      expect({ fill, label, card, cardLabel }).toEqual({ fill: accent, label: onAccent, card: accent, cardLabel: onAccent });
      expect(colors.linkButtonFill).toBeUndefined();
      expect(failing).toEqual([]);
    },
  );

  it('fills the ocean button in a light site blue with the theme label', () => {
    const { colors, fill, label, card, cardLabel, failing } = result({ theme: 'ocean', user_message_color: '#0ea5e9' });
    expect({ fill, label, card, cardLabel }).toEqual({ fill: '#0ea5e9', label: '#082f49', card: '#0ea5e9', cardLabel: '#082f49' });
    expect(colors.cardButtonFill).toBeUndefined();
    expect(colors.linkButtonHover).toBe(toHex(mix(rgb('#0ea5e9'), WHITE, 0.1)));
    expect(failing).toEqual([]);
  });

  it('fills the aurora button in a light site pink with the theme label', () => {
    const { fill, label, card, failing } = result({ theme: 'aurora', link_color: '#f472b6' });
    expect({ fill, label, card }).toEqual({ fill: '#f472b6', label: '#3b0764', card: '#f472b6' });
    expect(failing).toEqual([]);
  });

  it('takes a site blue with white text on a white site bubble in the dark theme', () => {
    const { fill, label, card, failing } = result({ theme: 'dark', bot_message_color: '#ffffff', link_color: '#2760CF' });
    expect({ fill, label, card }).toEqual({ fill: '#2760cf', label: '#ffffff', card: '#2760cf' });
    expect(failing).toEqual([]);
  });

  it.each(['dark', 'ocean', 'aurora'] as const)('lets every control of the real colour sets pass in the %s theme', (theme) => {
    const sets = [
      { link_color: '#C69300', button_text_color: '#1C1C1C', send_button_style: { backgroundColor: '#F2B705' }, user_message_color: '#FFF2CC' },
      { link_color: '#dd4a97', send_button_style: { backgroundColor: '#dd4a97' }, user_message_color: '#ed719e' },
      { link_color: '#075985', user_message_color: '#075985' },
      { link_color: '#2760CF', user_message_color: '#2760CF' },
      { send_button_style: { backgroundColor: '#2a3849' }, user_message_color: '#2a3849' },
      { user_message_color: '#003a5d' },
    ];
    for (const props of sets) {
      const { colors, card, fill, failing } = result({ theme, ...props });
      expect(failing).toEqual([]);
      // A site colour reads on the card too: both buttons show one colour.
      if (colors.linkButtonFill) expect(card).toBe(fill);
    }
  });
});

describe('hover shades of the link buttons', () => {
  it('darkens a site colour on hover, on the link button and the card button', () => {
    const { colors, pairs } = guardControlColors({ link_color: '#dd4a97' });
    expect(colors.linkButtonHover).toBe(toHex(mix(rgb('#c74388'), BLACK, 0.1)));
    expect(colors.cardButtonHover).toBeUndefined();
    const hovers = pairs.filter((pair) => pair.control.endsWith('on hover'));
    expect(hovers.map((pair) => pair.control)).toEqual([
      'filled link button on hover', 'checkout card button on hover', 'filled link button label on hover',
    ]);
    expect(hovers.filter((pair) => pair.ratio < pair.minimum)).toEqual([]);
  });

  it('gives a white fallback fill a light grey hover', () => {
    const { colors } = guardControlColors({ bot_message_color: '#791f0d', bot_message_text_color: '#ffffff' });
    expect(colors).toMatchObject({ linkButtonFill: '#ffffff', linkButtonHover: toHex(mix(WHITE, BLACK, 0.1)) });
  });

  it('gives a card button with its own fill its own hover', () => {
    // The theme blue reads on the near-black bubble, not on the card: the card button turns white.
    const { colors, pairs } = guardControlColors({ bot_message_color: '#111827', bot_message_text_color: '#ffffff' });
    expect(colors.linkButtonHover).toBeUndefined();
    expect(colors).toMatchObject({ cardButtonFill: '#ffffff', cardButtonHover: toHex(mix(WHITE, BLACK, 0.1)) });
    expect(pairs.filter((pair) => pair.ratio < pair.minimum)).toEqual([]);
  });

  it('sets no hover for the theme colours, button_color or the swarovski theme', () => {
    expect(guardControlColors({ theme: 'default' }).colors.linkButtonHover).toBeUndefined();
    const ownButton = guardControlColors({
      button_color: '#9e183b', bot_message_color: '#9e183b', bot_message_text_color: '#ffffff', link_color: '#FFD700',
    }).colors;
    expect(ownButton.linkButtonFill).toBe('#ffd700');
    expect(ownButton.linkButtonHover).toBeUndefined();
    expect(guardControlColors({ theme: 'swarovski', bot_message_color: '#791f0d' }).colors.linkButtonHover).toBeUndefined();
  });
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

describe('checkout card', () => {
  const card = (props: Parameters<typeof guardControlColors>[0]) => {
    const { colors, pairs } = guardControlColors(props);
    const pair = (control: string) => pairs.find((item) => item.control === control);
    return {
      colors,
      button: pair('checkout card button')!, label: pair('checkout card button label')!,
      ring: pair('checkout card button focus mark')!, title: pair('checkout card title')!, venue: pair('checkout card venue')!,
      failing: pairs.filter((item) => item.ratio < item.minimum),
    };
  };

  it.each(Object.keys(THEME_COLORS) as ThemeName[])('measures the card of the %s theme on its own surface', (theme) => {
    const result = card({ theme });
    // A translucent colour shows the one behind it: the card on the bubble on the list.
    const on = (color: string, backdrop: Rgb) => paintOver(parseColor(color)!.rgb, parseColor(color)!.alpha, backdrop);
    const { list, bubble, card: surface } = THEME_COLORS[theme];
    expect(result.button.background).toBe(toHex(on(surface, on(bubble, rgb(list)))));
    expect(result.title.minimum).toBe(TEXT_MIN);
    expect(result.venue.foreground).toBe(THEME_COLORS[theme].cardMeta);
    expect(result.failing).toEqual([]);
    // The theme needs no card colours of its own.
    expect(Object.keys(result.colors).filter((key) => key.startsWith('card'))).toEqual([]);
  });

  it('lifts a dark site bubble and keeps the gold button on it', () => {
    const result = card({
      theme: 'default', button_color: '#9e183b', button_text_color: '#ffffff', bot_message_color: '#9e183b',
      bot_message_text_color: '#ffffff', link_color: '#FFD700',
    });
    // 8% toward white: a slightly lighter red.
    expect(result.colors).toMatchObject({ cardSurface: 'custom', cardBg: toHex(mix(rgb('#9e183b'), WHITE, 0.08)) });
    expect(result.colors.cardButtonFill).toBeUndefined();
    expect(result.button).toMatchObject({ foreground: '#ffd700', background: result.colors.cardBg });
    expect(result.label.foreground).toBe('#9e183b');
    expect(result.title.minimum).toBe(TEXT_MIN);
    expect(result.venue.ratio).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(result.colors.cardMeta).not.toBe('#ffffff');
    expect(result.failing).toEqual([]);
  });

  it('keeps the bubble colour where the answer text would read worse on a lighter card', () => {
    // White text on a mid green reads at 3:1 only. A light card would hide it.
    const result = card({
      button_text_color: '#ffffff', background_color: '#f1efee', bot_message_color: '#3aaa35', bot_message_text_color: '#ffffff',
    });
    expect(result.colors).toMatchObject({ cardSurface: 'custom', cardBg: '#3aaa35', cardMeta: '#ffffff' });
    // The site's own 3:1 is the floor for the title and the venue.
    expect(result.title.minimum).toBe(3);
    expect(result.title.ratio).toBeGreaterThanOrEqual(3);
    expect(result.venue.minimum).toBe(3);
    expect(result.button.ratio).toBeGreaterThanOrEqual(BOUNDARY_MIN);
    expect(result.label.ratio).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(result.failing).toEqual([]);
  });

  it('lifts a light site bubble toward white and checks the site button on it', () => {
    const result = card({
      theme: 'punku-ai-bookingkit', button_color: '#38AA3F', bot_message_style: { backgroundColor: '#F0F7FA', color: '#0f172a' },
    });
    expect(result.colors.cardBg).toBe(toHex(mix(rgb('#f0f7fa'), WHITE, 0.7)));
    expect(result.button.ratio).toBeGreaterThanOrEqual(BOUNDARY_MIN);
    expect(result.label.ratio).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(result.failing).toEqual([]);
  });

  it('gives the card button its own fill where the link button fill vanishes on the lighter card', () => {
    const props = {
      button_color: '#15803d', button_text_color: '#ffffff', bot_message_color: '#111827', bot_message_text_color: '#ffffff',
    };
    // The green reads on the bubble (3.5:1), not on the card (2.9:1).
    const lifted = mix(rgb('#111827'), WHITE, 0.08);
    expect(contrastRatio(rgb('#15803d'), rgb('#111827'))).toBeGreaterThanOrEqual(BOUNDARY_MIN);
    expect(contrastRatio(rgb('#15803d'), lifted)).toBeLessThan(BOUNDARY_MIN);
    const result = card(props);
    // Link buttons outside the card keep the site green.
    expect(result.colors.linkButtonFill).toBeUndefined();
    expect(result.colors.cardButtonFill).toBeDefined();
    expect(result.button).toMatchObject({ foreground: result.colors.cardButtonFill, background: toHex(lifted) });
    expect(result.ring.ratio).toBeGreaterThanOrEqual(BOUNDARY_MIN);
    expect(result.failing).toEqual([]);
  });

  it('follows a site answer text colour on the theme card', () => {
    const result = card({ theme: 'default', bot_message_text_color: '#3f3f46' });
    expect(result.colors.cardBg).toBeUndefined();
    expect(result.colors.cardMeta).toBe(toHex(cardMetaColor(rgb('#3f3f46'), rgb(THEME_COLORS.default.card))));
    expect(result.failing).toEqual([]);
  });

  it.each([
    // Grey text reads at 4.54:1 on the white bubble and 4.34:1 on the theme
    // card: the card turns white, the bubble lifted toward white.
    ['default', '#767676', '#ffffff'],
    // 4.78:1 on the bubble, 4.1:1 on the theme card, 3.75:1 on the lift: the
    // card keeps the bubble colour.
    ['dark', '#8a94a6', '#1e293b'],
  ])('leaves the %s theme card where a site text colour %s would read worse on it', (theme, text, surface) => {
    const result = card({ theme, bot_message_text_color: text });
    expect(contrastRatio(rgb(text), rgb(THEME_COLORS[theme as ThemeName].card))).toBeLessThan(TEXT_MIN);
    expect(result.colors).toMatchObject({ cardSurface: 'custom', cardBg: surface, cardMeta: text });
    expect(result.title.ratio).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(result.venue.ratio).toBeGreaterThanOrEqual(TEXT_MIN);
    expect(result.failing).toEqual([]);
  });

  it('brings the theme venue colour up to the answer text floor', () => {
    // The translucent aurora bubble over a light window: the theme's light
    // violet venue would read at about 1.4:1.
    const result = card({ theme: 'aurora', background_color: '#f5f3ff' });
    const themeVenue = paintOver(rgb(THEME_COLORS.aurora.cardMeta), 1, rgb(result.venue.background));
    expect(contrastRatio(themeVenue, rgb(result.venue.background))).toBeLessThan(2);
    expect(result.colors.cardMeta).toBeDefined();
    expect(result.venue.ratio).toBeGreaterThanOrEqual(result.title.minimum);
    expect(result.failing).toEqual([]);
  });

  it('makes a clear card on a gradient or an image', () => {
    const { colors, pairs } = guardControlColors({ bot_message_style: { background: 'linear-gradient(#4c1d95, #7c3aed)' } });
    expect(colors.cardSurface).toBe('image');
    expect(colors.cardBg).toBeUndefined();
    expect(pairs.filter((pair) => pair.control.startsWith('checkout card'))).toEqual([]);
  });

  describe('cardSurface and cardMetaColor', () => {
    it('lifts a light bubble 70% and a dark one 8% toward white', () => {
      expect(cardSurface(rgb('#d0d0d0'), null)).toEqual(mix(rgb('#d0d0d0'), WHITE, 0.7));
      expect(cardSurface(rgb('#202020'), null)).toEqual(mix(rgb('#202020'), WHITE, 0.08));
      expect(cardSurface(rgb('#202020'), rgb('#ffffff'))).toEqual(mix(rgb('#202020'), WHITE, 0.08));
      // Dark text on a light bubble reads better still on the lighter card.
      expect(cardSurface(rgb('#d0d0d0'), BLACK)).toEqual(mix(rgb('#d0d0d0'), WHITE, 0.7));
    });

    it('takes the theme card first, then the lift, then the bubble', () => {
      const themeCard = rgb('#f8fafc');
      expect(cardSurface(rgb('#ffffff'), rgb('#1e293b'), themeCard)).toEqual(themeCard);
      expect(cardSurface(rgb('#ffffff'), rgb('#767676'), themeCard)).toEqual(rgb('#ffffff'));
      expect(cardSurface(rgb('#1e293b'), rgb('#8a94a6'), rgb('#273449'))).toEqual(rgb('#1e293b'));
      expect(cardSurface(rgb('#1e293b'), null, rgb('#273449'))).toEqual(rgb('#273449'));
    });

    it('tones the venue toward the card while it keeps 4.5:1', () => {
      const card = rgb('#ffffff');
      const toned = cardMetaColor(rgb('#111827'), card);
      expect(toned).toEqual(mix(rgb('#111827'), card, 0.22));
      expect(contrastRatio(toned, card)).toBeGreaterThanOrEqual(TEXT_MIN);
      // Text that only just reads keeps its colour.
      expect(cardMetaColor(rgb('#767676'), card)).toEqual(rgb('#767676'));
    });
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
