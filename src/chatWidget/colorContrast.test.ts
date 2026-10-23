import { contrastRatio, isReadableOn, parseOpaqueColor } from './colorContrast';

describe('parseOpaqueColor', () => {
  it.each([
    ['#791f0d', [121, 31, 13]],
    ['#FFF', [255, 255, 255]],
    ['#fffF', [255, 255, 255]],
    ['#1d4ed8ff', [29, 78, 216]],
    ['rgb(31, 41, 55)', [31, 41, 55]],
    ['rgba(31, 41, 55, 1)', [31, 41, 55]],
    ['rgb(31 41 55 / 100%)', [31, 41, 55]],
    [' #eaf1ff ', [234, 241, 255]],
  ])('reads %s', (value, expected) => {
    expect(parseOpaqueColor(value)).toEqual(expected);
  });

  it.each([
    'white', 'linear-gradient(#fff, #000)', 'var(--brand)', '#12345', 'rgba(255, 255, 255, 0.85)',
    '#ffffff80', 'rgb(300, 0, 0)', '', undefined, 42,
  ])('cannot read %s', (value) => {
    expect(parseOpaqueColor(value)).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('gives 21 for black on white and 1 for one colour', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([121, 31, 13], [121, 31, 13])).toBeCloseTo(1, 5);
  });
});

describe('isReadableOn', () => {
  // The answer colours of real customer embeds, with the theme link colour.
  it.each([
    ['#1d4ed8', '#791f0d', false],
    ['#1d4ed8', '#7a2022', false],
    ['#1d4ed8', '#9e183b', false],
    ['#1d4ed8', '#3aaa35', false],
    ['#1d4ed8', '#781C3C', false],
    ['#1d4ed8', '#EAF1FF', true],
    ['#1d4ed8', '#FFFFFF', true],
    ['#a5b4fc', '#1F2937', true],
  ])('%s on %s: %s', (foreground, background, readable) => {
    expect(isReadableOn(foreground, background)).toBe(readable);
  });

  it('is false when a colour cannot be read', () => {
    expect(isReadableOn('#1d4ed8', 'linear-gradient(#fff, #eee)')).toBe(false);
    expect(isReadableOn('#1d4ed8', 'rgba(255, 255, 255, 0.5)')).toBe(false);
  });
});
