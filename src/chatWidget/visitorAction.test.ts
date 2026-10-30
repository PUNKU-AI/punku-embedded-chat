import { isVisitorAction, noteVisitorInput, takesKeys, VISITOR_ACTION_MS, watchVisitorInput } from './visitorAction';

// jsdom cannot dispatch a trusted event: the tests hand over a plain object.
const trusted = (type: string, target?: Element) => ({ isTrusted: true, type, target }) as unknown as Event;

// jsdom has no layout: a control that stays on the screen gets a box.
function onScreen<T extends Element>(element: T): T {
  element.getClientRects = () => [{ width: 80, height: 32 }] as unknown as DOMRectList;
  document.body.appendChild(element);
  return element;
}

describe('visitor actions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    // A press ends the time of a click, and the pending timeout clears the
    // mark: the next test starts without either.
    noteVisitorInput(trusted('pointerdown'));
    jest.runOnlyPendingTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = '';
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
  describe('a page that opens the chat a moment after the click', () => {
    it('counts a click on a control that has left the page since, for one second', () => {
      // A chat notice of a page: the visitor's Accept, then the notice leaves the page.
      const accept = onScreen(document.createElement('button'));
      noteVisitorInput(trusted('click', accept));
      // The task of the click is over.
      jest.runOnlyPendingTimers();
      accept.remove();

      jest.advanceTimersByTime(200);
      expect(isVisitorAction()).toBe(true);
      jest.advanceTimersByTime(VISITOR_ACTION_MS - 200);
      expect(isVisitorAction()).toBe(true);
      jest.advanceTimersByTime(1);
      expect(isVisitorAction()).toBe(false);
    });

    it('counts a click on a control that is hidden since, such as a closed menu', () => {
      const item = onScreen(document.createElement('button'));
      noteVisitorInput(trusted('click', item));
      jest.runOnlyPendingTimers();

      item.getClientRects = () => [] as unknown as DOMRectList;
      expect(isVisitorAction()).toBe(true);
    });

    it('does not count a later open after a click on a control that stays, such as a link in the text', () => {
      const link = onScreen(document.createElement('a'));
      noteVisitorInput(trusted('click', link));
      jest.runOnlyPendingTimers();

      jest.advanceTimersByTime(200);
      expect(isVisitorAction()).toBe(false);
    });

    it('counts a chat toggle of the page that stays, also inside it', () => {
      const toggle = onScreen(document.createElement('button'));
      toggle.setAttribute('data-punku-handler', '');
      // The icon in the toggle shows too: only the toggle mark can make this count.
      const icon = onScreen(document.createElement('span'));
      toggle.appendChild(icon);
      noteVisitorInput({ isTrusted: true, type: 'click', target: icon, composedPath: () => [icon, toggle, document.body] } as unknown as Event);
      jest.runOnlyPendingTimers();

      jest.advanceTimersByTime(300);
      expect(isVisitorAction()).toBe(true);

      // The same control without the mark does not count.
      toggle.removeAttribute('data-punku-handler');
      noteVisitorInput({ isTrusted: true, type: 'click', target: icon, composedPath: () => [icon, toggle, document.body] } as unknown as Event);
      jest.runOnlyPendingTimers();
      expect(isVisitorAction()).toBe(false);
    });

    it('counts Enter and Space on a scripted button, which gets no click from the browser', () => {
      for (const key of ['Enter', ' ']) {
        const accept = onScreen(document.createElement('div'));
        accept.setAttribute('role', 'button');
        noteVisitorInput({ isTrusted: true, type: 'keydown', key, target: accept } as unknown as Event);
        jest.runOnlyPendingTimers();
        accept.remove();

        expect(isVisitorAction()).toBe(true);
      }
    });

    it('starts no time with another key, or with Enter in a page field', () => {
      const accept = onScreen(document.createElement('div'));
      noteVisitorInput({ isTrusted: true, type: 'keydown', key: 'a', target: accept } as unknown as Event);
      jest.runOnlyPendingTimers();
      accept.remove();
      expect(isVisitorAction()).toBe(false);

      const field = onScreen(document.createElement('input'));
      noteVisitorInput({ isTrusted: true, type: 'keydown', key: 'Enter', target: field } as unknown as Event);
      jest.runOnlyPendingTimers();
      field.remove();
      expect(isVisitorAction()).toBe(false);
    });

    it('starts no time with a control that does not show when it is pressed, such as the native input of a custom switch', () => {
      // The label forwards the click to the hidden input.
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'checkbox';
      document.body.appendChild(hiddenInput);
      noteVisitorInput(trusted('click', hiddenInput));
      jest.runOnlyPendingTimers();

      expect(isVisitorAction()).toBe(false);
    });

    it('counts a control that is transparent or invisible since', () => {
      const accept = onScreen(document.createElement('button'));
      let visible = true;
      accept.checkVisibility = () => visible;
      noteVisitorInput(trusted('click', accept));
      jest.runOnlyPendingTimers();
      expect(isVisitorAction()).toBe(false);

      // The notice fades out to opacity 0 and stays on the page.
      visible = false;
      expect(isVisitorAction()).toBe(true);
    });

    it('ends the time at the next press or key', () => {
      for (const next of ['pointerdown', 'mousedown', 'keydown']) {
        const accept = onScreen(document.createElement('button'));
        noteVisitorInput(trusted('click', accept));
        noteVisitorInput(trusted(next, document.body));
        jest.runOnlyPendingTimers();
        accept.remove();

        expect(isVisitorAction()).toBe(false);
      }
    });

    it('keeps the time over the release of the press', () => {
      const accept = onScreen(document.createElement('button'));
      noteVisitorInput(trusted('click', accept));
      for (const type of ['pointerup', 'mouseup', 'touchend', 'keyup']) noteVisitorInput(trusted(type, accept));
      jest.runOnlyPendingTimers();
      accept.remove();

      expect(isVisitorAction()).toBe(true);
    });

    it('starts no time with a click into a page field, but counts it while the page handles it', () => {
      const field = onScreen(document.createElement('textarea'));
      noteVisitorInput(trusted('click', field));
      // A page field that opens the chat on the visitor's click.
      expect(isVisitorAction(field)).toBe(true);

      jest.runOnlyPendingTimers();
      field.remove();
      expect(isVisitorAction()).toBe(false);
    });

    it('leaves the focus in a page field, list box or frame that has it by then', () => {
      const accept = onScreen(document.createElement('button'));
      noteVisitorInput(trusted('click', accept));
      jest.runOnlyPendingTimers();
      accept.remove();

      expect(isVisitorAction(document.createElement('input'))).toBe(false);
      expect(isVisitorAction(document.createElement('select'))).toBe(false);
      expect(isVisitorAction(document.createElement('iframe'))).toBe(false);
      expect(isVisitorAction(document.createElement('button'))).toBe(true);
      expect(isVisitorAction(null)).toBe(true);
    });

    it('forgets the click when the last widget leaves the page', () => {
      const stop = watchVisitorInput();
      const accept = onScreen(document.createElement('button'));
      noteVisitorInput(trusted('click', accept));
      accept.remove();
      // Also the mark of the task: its timeout has not run yet.
      stop();

      expect(isVisitorAction()).toBe(false);
    });
  });

  it('knows the elements that take keys', () => {
    const input = (type: string) => Object.assign(document.createElement('input'), { type });
    const editable = document.createElement('div');
    // jsdom does not compute isContentEditable.
    Object.defineProperty(editable, 'isContentEditable', { value: true });

    for (const element of [input('text'), input('search'), input('email'), document.createElement('textarea'),
      document.createElement('select'), editable, document.createElement('iframe')]) {
      expect(takesKeys(element)).toBe(true);
    }
    for (const element of [input('submit'), input('checkbox'), document.createElement('button'),
      document.createElement('a'), document.body, null]) {
      expect(takesKeys(element)).toBe(false);
    }
  });
});
