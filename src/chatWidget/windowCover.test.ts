import { act, renderHook } from '@testing-library/react';
import { holdsBox, useWindowCoversTrigger } from './windowCover';

// jsdom has no layout: each element gets its box.
const box = (left: number, top: number, width: number, height: number) => ({
  x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}),
}) as DOMRect;
const place = (element: Element, rect: DOMRect) => {
  element.getBoundingClientRect = () => rect;
};

describe('holdsBox', () => {
  // 400 % zoom on a 1280 x 924 window: a 320 x 231 card, and the trigger 20 px from the corner.
  it('holds a box inside it, and a box of the same size', () => {
    expect(holdsBox(box(0, 0, 320, 231), box(252, 163, 48, 48))).toBe(true);
    expect(holdsBox(box(252, 163, 48, 48), box(252, 163, 48, 48))).toBe(true);
  });

  it('allows half a pixel for rounding, and no more', () => {
    expect(holdsBox(box(0, 0, 320, 231), box(272.4, 163, 48, 48))).toBe(true);
    expect(holdsBox(box(0, 0, 320, 231), box(272.6, 163, 48, 48))).toBe(false);
  });

  it('does not hold the trigger below a phone window that keeps 80 px for it', () => {
    // A 390 x 664 phone: the window ends at 584 px, the trigger starts at 596 px.
    expect(holdsBox(box(0, 60, 390, 524), box(322, 596, 48, 48))).toBe(false);
  });

  it('never holds an empty box, such as a hidden trigger', () => {
    // chat_trigger_style display: none
    expect(holdsBox(box(0, 0, 320, 231), box(0, 0, 0, 0))).toBe(false);
    expect(holdsBox(box(0, 0, 0, 0), box(0, 0, 0, 0))).toBe(false);
  });
});

describe('useWindowCoversTrigger', () => {
  // The window layer of ChatWidget with its card, and the trigger.
  let layer: HTMLDivElement;
  let chatWindow: HTMLElement;
  let card: HTMLElement;
  let trigger: HTMLButtonElement;
  const layerRef = { current: null as HTMLDivElement | null };
  const triggerRef = { current: null as HTMLButtonElement | null };

  beforeEach(() => {
    jest.useFakeTimers();
    layer = document.createElement('div');
    layer.innerHTML = '<div class="cl-chat-window"><div class="cl-window"></div></div>';
    chatWindow = layer.querySelector<HTMLElement>('.cl-chat-window')!;
    card = layer.querySelector<HTMLElement>('.cl-window')!;
    trigger = document.createElement('button');
    document.body.append(trigger, layer);
    layerRef.current = layer;
    triggerRef.current = trigger;
    // 400 % zoom: the card fills the screen, over the trigger.
    place(card, box(0, 0, 320, 231));
    place(trigger, box(252, 163, 48, 48));
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  // The next animation frame runs the scheduled check.
  const nextFrame = () => act(() => {
    jest.advanceTimersByTime(20);
  });

  it('is true before the first open frame is painted, and false while the chat is closed', () => {
    const { result, rerender } = renderHook(({ open }) => useWindowCoversTrigger(open, layerRef, triggerRef), {
      initialProps: { open: false },
    });
    expect(result.current).toBe(false);

    rerender({ open: true });
    expect(result.current).toBe(true);

    rerender({ open: false });
    expect(result.current).toBe(false);
  });

  it('checks again when the window has risen into place', () => {
    // The opening rise: the card starts lower and leaves the trigger out.
    place(card, box(0, 0, 320, 150));
    const { result } = renderHook(() => useWindowCoversTrigger(true, layerRef, triggerRef));
    // The subscription to the visible area checks once more in the first frame.
    nextFrame();
    expect(result.current).toBe(false);

    place(card, box(0, 0, 320, 231));
    // A transition of a part inside the window does not count.
    card.dispatchEvent(new Event('transitionend', { bubbles: true }));
    nextFrame();
    expect(result.current).toBe(false);

    chatWindow.dispatchEvent(new Event('transitionend'));
    nextFrame();
    expect(result.current).toBe(true);
  });

  it('checks again when a transition stops early', () => {
    place(card, box(0, 0, 320, 150));
    const { result } = renderHook(() => useWindowCoversTrigger(true, layerRef, triggerRef));
    nextFrame();
    expect(result.current).toBe(false);

    place(card, box(0, 0, 320, 231));
    chatWindow.dispatchEvent(new Event('transitioncancel'));
    nextFrame();
    expect(result.current).toBe(true);
  });

  it('checks again after a resize, as when the on-screen keyboard closes', () => {
    const { result } = renderHook(() => useWindowCoversTrigger(true, layerRef, triggerRef));
    nextFrame();
    expect(result.current).toBe(true);

    // The window keeps the room for the trigger again.
    place(card, box(0, 0, 320, 150));
    window.dispatchEvent(new Event('resize'));
    nextFrame();
    expect(result.current).toBe(false);
  });

  it('checks again when the trigger moves without a resize (setTriggerPosition)', () => {
    const { result, rerender } = renderHook(({ placement }) => useWindowCoversTrigger(true, layerRef, triggerRef, placement), {
      initialProps: { placement: 'a' },
    });
    expect(result.current).toBe(true);

    place(trigger, box(400, 20, 48, 48));
    rerender({ placement: 'b' });
    expect(result.current).toBe(false);
  });

  it('is false without a window card, as in a window that has not rendered yet', () => {
    card.remove();
    const { result } = renderHook(() => useWindowCoversTrigger(true, layerRef, triggerRef));

    expect(result.current).toBe(false);
  });
});
