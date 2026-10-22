import { layoutClosedWidgetHint } from './closedWidgetHintLayout';

// jsdom has no layout. Each test gives the trigger, its anchor and the hint
// client rects, and installs a visual viewport.
const jsdomVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

function layout(scale: number) {
  // The same widget at `scale` rendered px per widget px: a 48 px trigger
  // near the bottom-right corner of a 412 x 839 screen, a 172 x 38 px hint.
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: { offsetLeft: 0, offsetTop: 0, width: 412 * scale, height: 839 * scale, scale: 1 },
  });
  const anchor = document.createElement('div');
  const hint = document.createElement('div');
  const trigger = document.createElement('button');
  anchor.append(hint, trigger);
  Object.defineProperty(anchor, 'offsetWidth', { configurable: true, value: 48 });
  anchor.getBoundingClientRect = () => rect(270 * scale, 120 * scale, 48 * scale, 48 * scale);
  trigger.getBoundingClientRect = () => rect(270 * scale, 120 * scale, 48 * scale, 48 * scale);
  hint.getBoundingClientRect = () => rect(0, 0, 172 * scale, 38 * scale);

  const result = layoutClosedWidgetHint(hint, trigger, 'cl-hint-left');
  const style = ['max-width', 'max-height', 'left', 'top', '--cl-closed-hint-arrow-y']
    .map((property) => hint.style.getPropertyValue(property));
  return { result, style };
}

afterEach(() => {
  if (jsdomVisualViewport) Object.defineProperty(window, 'visualViewport', jsdomVisualViewport);
  else delete (window as { visualViewport?: unknown }).visualViewport;
});

describe('layoutClosedWidgetHint', () => {
  it('places the hint 12 px beside the trigger', () => {
    expect(layout(1)).toEqual({
      result: { positionClass: 'cl-hint-left' },
      style: ['316px', '823px', '-184px', '5px', '19px'],
    });
  });

  it('writes the same widget px inside a scaled page frame (#82)', () => {
    // The frame shows the widget at half size, so client rects are half the widget px.
    expect(layout(0.5)).toEqual(layout(1));
  });
});
