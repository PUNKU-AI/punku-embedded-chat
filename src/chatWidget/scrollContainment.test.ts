import { containScrollEvents, keepTouchScrollInside } from './scrollContainment';

describe('containScrollEvents', () => {
  it('stops wheel and touchmove events from reaching the window', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const wheel = jest.fn();
    const touch = jest.fn();
    window.addEventListener('wheel', wheel);
    window.addEventListener('touchmove', touch);

    const stop = containScrollEvents(element);
    element.dispatchEvent(new Event('wheel', { bubbles: true }));
    element.dispatchEvent(new Event('touchmove', { bubbles: true }));
    expect(wheel).not.toHaveBeenCalled();
    expect(touch).not.toHaveBeenCalled();

    stop();
    element.dispatchEvent(new Event('wheel', { bubbles: true }));
    element.dispatchEvent(new Event('touchmove', { bubbles: true }));
    expect(wheel).toHaveBeenCalledTimes(1);
    expect(touch).toHaveBeenCalledTimes(1);

    window.removeEventListener('wheel', wheel);
    window.removeEventListener('touchmove', touch);
    element.remove();
  });

  it('accepts a missing element', () => {
    expect(() => containScrollEvents(null)()).not.toThrow();
  });
});

describe('keepTouchScrollInside', () => {
  // A window with a header, a message list 300 px tall with 900 px of
  // messages, and a field. jsdom has no layout, so the sizes are set.
  const setup = () => {
    const chatWindow = document.createElement('div');
    chatWindow.innerHTML = '<div class="header"><span>Title</span></div>'
      + '<div class="list" style="overflow-y: auto"><p>Answer</p></div>'
      + '<textarea></textarea>';
    document.body.append(chatWindow);
    const list = chatWindow.querySelector<HTMLElement>('.list')!;
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 900 });
    const stop = keepTouchScrollInside(chatWindow);
    return { chatWindow, list, stop };
  };

  // One finger (or more) from `from` to `to`. Returns true if the move was cancelled.
  const drag = (target: Element, from: number[], to: number[], fingers = 1) => {
    const touches = (y: number) => Array.from({ length: fingers }, (_, index) => ({ clientX: 100 + index * 50, clientY: y }));
    const start = new Event('touchstart', { bubbles: true, composed: true });
    Object.defineProperty(start, 'touches', { value: touches(from[1]) });
    target.dispatchEvent(start);
    const move = new Event('touchmove', { bubbles: true, composed: true, cancelable: true });
    Object.defineProperty(move, 'touches', { value: touches(to[1]).map((touch) => ({ ...touch, clientX: touch.clientX + to[0] - from[0] })) });
    target.dispatchEvent(move);
    return move.defaultPrevented;
  };

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('cancels a drag on a part that cannot scroll, so the page behind stays', () => {
    const { chatWindow } = setup();
    const title = chatWindow.querySelector('.header span')!;
    expect(drag(title, [100, 200], [100, 120])).toBe(true);
    expect(drag(title, [100, 200], [180, 200])).toBe(true);
  });

  it('lets the message list scroll in both directions from the middle', () => {
    const { chatWindow, list } = setup();
    list.scrollTop = 300;
    const answer = chatWindow.querySelector('.list p')!;
    expect(drag(answer, [100, 200], [100, 120])).toBe(false);
    expect(drag(answer, [100, 200], [100, 280])).toBe(false);
  });

  it('cancels a drag past the end of the message list', () => {
    const { chatWindow, list } = setup();
    const answer = chatWindow.querySelector('.list p')!;
    // At the top, a finger that moves down would scroll the page.
    list.scrollTop = 0;
    expect(drag(answer, [100, 200], [100, 280])).toBe(true);
    expect(drag(answer, [100, 200], [100, 120])).toBe(false);
    // At the bottom, a finger that moves up would scroll the page.
    list.scrollTop = 600;
    expect(drag(answer, [100, 200], [100, 120])).toBe(true);
    expect(drag(answer, [100, 200], [100, 280])).toBe(false);
  });

  it('leaves moves in a field to the browser, for the caret and the selection', () => {
    const { chatWindow } = setup();
    expect(drag(chatWindow.querySelector('textarea')!, [100, 200], [100, 120])).toBe(false);
  });

  it('leaves two-finger moves to the browser, so the visitor can pinch-zoom', () => {
    const { chatWindow } = setup();
    expect(drag(chatWindow.querySelector('.header span')!, [100, 200], [100, 120], 2)).toBe(false);
  });

  it('stops after cleanup', () => {
    const { chatWindow, stop } = setup();
    stop();
    expect(drag(chatWindow.querySelector('.header span')!, [100, 200], [100, 120])).toBe(false);
  });

  it('accepts a missing element', () => {
    expect(() => keepTouchScrollInside(null)()).not.toThrow();
  });
});
