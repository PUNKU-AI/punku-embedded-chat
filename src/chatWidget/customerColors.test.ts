import { CUSTOMER_COLORS } from './__fixtures__/customerColors';
import { contrastRatio, parseOpaqueColor, Rgb } from './colorContrast';
import { guardControlColors, guardDialogConfirm, guardHintColors, TEXT_MIN } from './controlColors';

// Every saved customer configuration: no control may fall below its minimum
// (3:1 for fills, outlines and icons; 4.5:1 for links, labels and the AI notice).
describe('controls on every saved customer configuration', () => {
  it.each(CUSTOMER_COLORS.map((colors) => [colors.name, colors] as const))('%s', (_name, colors) => {
    const { pairs } = guardControlColors(colors);
    const failing = pairs.filter((pair) => pair.ratio < pair.minimum);
    expect(failing).toEqual([]);
  });

  it.each(CUSTOMER_COLORS.filter((colors) => colors.closed_widget_hint_background_color || colors.closed_widget_hint_text_color)
    .map((colors) => [colors.name, colors] as const))('%s: the closed hint text reads', (_name, colors) => {
    const background = colors.closed_widget_hint_background_color;
    const text = colors.closed_widget_hint_text_color;
    const guarded = guardHintColors(background, text);
    const fill = parseOpaqueColor(guarded.background || background || '#ffffff') as Rgb;
    const label = parseOpaqueColor(guarded.text || text || '#111827') as Rgb;
    expect(contrastRatio(label, fill)).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it.each(CUSTOMER_COLORS.filter((colors) => !colors.button_color && colors.theme !== 'swarovski')
    .map((colors) => [colors.name, colors] as const))('%s: the dialog confirm text reads', (_name, colors) => {
    const guarded = guardDialogConfirm(colors.button_text_color);
    const fill = parseOpaqueColor(guarded.fill || '#dc2626') as Rgb;
    const label = parseOpaqueColor(guarded.label || colors.button_text_color || '#ffffff') as Rgb;
    expect(contrastRatio(label, fill)).toBeGreaterThanOrEqual(TEXT_MIN);
    // A site text colour that reads stays.
    expect(guarded.label).toBeUndefined();
  });

  it('covers the cases from the review', () => {
    const rgb = (hex: string) => parseOpaqueColor(hex) as Rgb;
    // Before the guard: the filled button vanished in the same red, and the
    // theme's blue links read at about 1.6:1 on dark red.
    expect(contrastRatio(rgb('#9e183b'), rgb('#9e183b'))).toBe(1);
    expect(contrastRatio(rgb('#1d4ed8'), rgb('#791f0d'))).toBeLessThan(2);
    const sameRed = CUSTOMER_COLORS.filter((colors) => colors.button_color === '#9e183b');
    const darkRed = CUSTOMER_COLORS.filter((colors) => colors.bot_message_color === '#791f0d');
    expect(sameRed.length).toBeGreaterThan(0);
    expect(darkRed.length).toBeGreaterThan(0);
    for (const colors of [...sameRed, ...darkRed]) {
      expect(guardControlColors(colors).pairs.map((pair) => pair.control)).toEqual(
        expect.arrayContaining(['link', 'filled link button', 'filled link button label']),
      );
    }
  });
});
