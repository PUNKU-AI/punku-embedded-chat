import { isVisitorAction, noteVisitorInput, watchVisitorInput } from './visitorAction';

// jsdom cannot dispatch a trusted event: the tests hand over a plain object.
const trusted = (type: string) => ({ isTrusted: true, type }) as Event;

describe('visitor actions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    // The pending timeout clears the mark for the next test.
    jest.runOnlyPendingTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('marks the task of a trusted click or key press, and its microtasks', async () => {
    expect(isVisitorAction()).toBe(false);

    noteVisitorInput(trusted('keydown'));
    expect(isVisitorAction()).toBe(true);
    // A page handler that opens the chat after a resolved promise still counts.
    await Promise.resolve();
    expect(isVisitorAction()).toBe(true);

    // A timer that runs after the task does not.
    jest.runOnlyPendingTimers();
    expect(isVisitorAction()).toBe(false);
  });

  it('ignores an event that a script dispatches', () => {
    noteVisitorInput(new MouseEvent('click'));

    expect(isVisitorAction()).toBe(false);
  });

  it('keeps one mark for the events of one click', () => {
    const setTimeoutSpy = jest.spyOn(window, 'setTimeout');

    for (const type of ['mouseup', 'click']) noteVisitorInput(trusted(type));

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('listens on the window before the page, once for all widgets on the page', () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');

    const stopFirst = watchVisitorInput();
    const stopSecond = watchVisitorInput();
    const added = add.mock.calls.filter(([, listener]) => listener === noteVisitorInput);
    expect(added.map(([type]) => type).sort()).toEqual(
      ['click', 'keydown', 'keyup', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchend']
    );
    // The capture phase: the window's listener runs before the page's own listeners.
    expect(added.every(([, , capture]) => capture === true)).toBe(true);

    stopFirst();
    expect(remove).not.toHaveBeenCalledWith(expect.any(String), noteVisitorInput, true);
    stopSecond();
    expect(remove.mock.calls.filter(([, listener]) => listener === noteVisitorInput)).toHaveLength(8);
  });

  it('does not count a click that a script dispatches on the page', () => {
    const stop = watchVisitorInput();
    const button = document.createElement('button');
    let duringClick: boolean | undefined;
    button.addEventListener('click', () => {
      duringClick = isVisitorAction();
    });
    document.body.appendChild(button);
    try {
      button.click();
      expect(duringClick).toBe(false);
    } finally {
      button.remove();
      stop();
    }
  });
});
