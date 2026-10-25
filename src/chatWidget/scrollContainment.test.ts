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
      + '<div class="list" style="overflow-y: auto; overflow-x: hidden"><p>Answer</p></div>'
      + '<textarea style="overflow-y: hidden"></textarea>';
    document.body.append(chatWindow);
    const list = chatWindow.querySelector<HTMLElement>('.list')!;
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 900 });
    const stop = keepTouchScrollInside(chatWindow);
    return { chatWindow, list, stop };
  };

  // One touch sequence: the finger starts at (100, 200) and moves by each
  // [dx, dy] from there, in order. `fingers` touch at once. Returns, for each
  // move, whether it was cancelled.
  const drag = (target: Element, moves: number[][], fingers = 1) => {
    const touches = (dx: number, dy: number) =>
      Array.from({ length: fingers }, (_, index) => ({ clientX: 100 + index * 50 + dx, clientY: 200 + dy }));
    const start = new Event('touchstart', { bubbles: true, composed: true });
    Object.defineProperty(start, 'touches', { value: touches(0, 0) });
    target.dispatchEvent(start);
    return moves.map(([dx, dy]) => {
      const move = new Event('touchmove', { bubbles: true, composed: true, cancelable: true });
      Object.defineProperty(move, 'touches', { value: touches(dx, dy) });
      target.dispatchEvent(move);
      return move.defaultPrevented;
    });
  };

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('cancels a drag on a part that cannot scroll, so the page behind stays', () => {
    const { chatWindow } = setup();
    const title = chatWindow.querySelector('.header span')!;
    expect(drag(title, [[0, -80]])).toEqual([true]);
    expect(drag(title, [[80, 0]])).toEqual([true]);
    expect(drag(title, [[5, -3], [12, -40], [20, -90]])).toEqual([false, true, true]);
    // Straight sideways: nothing on the header scrolls either way up or down.
    expect(drag(title, [[7, 0]])).toEqual([true]);
  });

  it('lets the message list scroll in both directions from the middle', () => {
    const { chatWindow, list } = setup();
    list.scrollTop = 300;
    const answer = chatWindow.querySelector('.list p')!;
    expect(drag(answer, [[0, -80]])).toEqual([false]);
    expect(drag(answer, [[0, 80]])).toEqual([false]);
  });

  it('lets a flick scroll the list when its first samples go sideways', () => {
    // A thumb flick often starts with a sideways sample, such as (2, -1).
    // The list cannot scroll sideways. A cancelled move would stop the
    // whole flick on iOS.
    const { chatWindow, list } = setup();
    const answer = chatWindow.querySelector('.list p')!;
    list.scrollTop = 300;
    expect(drag(answer, [[2, -1], [5, -3], [9, -7], [12, -60]])).toEqual([false, false, false, false]);
    expect(drag(answer, [[7, -3], [12, -60]])).toEqual([false, false]);
    // At the end, the list can still scroll back up.
    list.scrollTop = 600;
    expect(drag(answer, [[2, 1], [9, 4], [12, 60]])).toEqual([false, false, false]);
  });

  it('cancels a drag past the end of the message list, also when it starts sideways', () => {
    const { chatWindow, list } = setup();
    const answer = chatWindow.querySelector('.list p')!;
    // At the top, a finger that moves down would scroll the page.
    list.scrollTop = 0;
    expect(drag(answer, [[0, 80]])).toEqual([true]);
    expect(drag(answer, [[0, -80]])).toEqual([false]);
    // At the bottom, a finger that moves up would scroll the page.
    list.scrollTop = 600;
    expect(drag(answer, [[0, -80]])).toEqual([true]);
    expect(drag(answer, [[2, -1], [7, -3], [12, -60]])).toEqual([false, true, true]);
  });

  it('decides once per touch, also when the finger turns', () => {
    const { chatWindow, list } = setup();
    const answer = chatWindow.querySelector('.list p')!;
    // At the top, a finger that moves up scrolls the list. It turns and ends
    // below its start, which alone would be cancelled: the touch keeps scrolling.
    list.scrollTop = 0;
    expect(drag(answer, [[0, -80], [0, 40]])).toEqual([false, false]);
    // A finger that moves down at the top is cancelled, also after it turns up.
    expect(drag(answer, [[0, 40], [0, -80]])).toEqual([true, true]);
  });

  it('waits for the vertical direction when a touch starts straight sideways', () => {
    // The list at its end, as after an answer. The thumb moves 7 px sideways,
    // then down to read older messages: the list must scroll.
    const { chatWindow, list } = setup();
    const answer = chatWindow.querySelector('.list p')!;
    list.scrollTop = 600;
    expect(drag(answer, [[7, 0], [7, 40]])).toEqual([false, false]);
    expect(drag(answer, [[3, 0], [8, -1], [11, 25], [13, 90]])).toEqual([false, false, false, false]);
    // Up at the end scrolls nothing: cancelled once the direction is known.
    expect(drag(answer, [[4, 1], [8, 1], [10, -30], [11, -90]])).toEqual([false, false, true, true]);
    // A drag that stays sideways is decided at 10 px.
    expect(drag(answer, [[7, 0], [12, 1], [20, 1]])).toEqual([false, false, false]);
    expect(drag(answer, [[7, 0], [12, 0], [20, 0]])).toEqual([false, true, true]);
    // In the middle, both vertical directions scroll: decided at once.
    list.scrollTop = 300;
    expect(drag(answer, [[7, 0], [7, 40]])).toEqual([false, false]);
  });

  it('cancels a drag on a field whose text fits, so the page behind stays', () => {
    const { chatWindow } = setup();
    expect(drag(chatWindow.querySelector('textarea')!, [[0, -80]])).toEqual([true]);
  });

  it('lets a field scroll its own text when the text does not fit', () => {
    const { chatWindow } = setup();
    const field = chatWindow.querySelector('textarea')!;
    field.style.overflowY = 'auto';
    Object.defineProperty(field, 'clientHeight', { configurable: true, value: 120 });
    Object.defineProperty(field, 'scrollHeight', { configurable: true, value: 300 });
    field.scrollTop = 60;
    expect(drag(field, [[0, -40]])).toEqual([false]);
    expect(drag(field, [[0, 40]])).toEqual([false]);
  });

  it('leaves moves inside the slop and two-finger moves to the browser', () => {
    const { chatWindow } = setup();
    const title = chatWindow.querySelector('.header span')!;
    expect(drag(title, [[3, -2], [-4, 5]])).toEqual([false, false]);
    expect(drag(title, [[0, -80]], 2)).toEqual([false]);
  });

  it('stops after cleanup', () => {
    const { chatWindow, stop } = setup();
    stop();
    expect(drag(chatWindow.querySelector('.header span')!, [[0, -80]])).toEqual([false]);
  });

  it('accepts a missing element', () => {
    expect(() => keepTouchScrollInside(null)()).not.toThrow();
  });
});
