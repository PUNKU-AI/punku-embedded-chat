import { isClosedWidgetHintVisible, observeClosedWidgetHintVisibility } from './closedWidgetHintVisibility';

const bounds = (x = 20, y = 20, width = 48, height = 48): DOMRect => ({
  x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON: () => ({})
});
let container: HTMLDivElement;
let trigger: HTMLButtonElement;

beforeEach(() => {
  container = document.createElement('div');
  trigger = document.createElement('button');
  container.append(trigger);
  document.body.append(container);
  jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(bounds());
});
afterEach(() => {
  container.remove();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('accepts a connected launcher with visible bounds', () => {
  expect(isClosedWidgetHintVisible(trigger)).toBe(true);
});

test.each(['display: none', 'visibility: hidden', 'visibility: collapse', 'opacity: 0'])(
  'defers exposure through an ancestor with %s', (style) => {
    container.setAttribute('style', style);
    expect(isClosedWidgetHintVisible(trigger)).toBe(false);
  }
);

test.each([
  bounds(20, 20, 0, 48), bounds(20, 20, 48, 0), bounds(-60),
  bounds(window.innerWidth + 1), bounds(20, window.innerHeight + 1)
])('defers exposure for zero or offscreen bounds: %j', (rect) => {
  jest.mocked(trigger.getBoundingClientRect).mockReturnValue(rect);
  expect(isClosedWidgetHintVisible(trigger)).toBe(false);
});

test('defers exposure for a detached launcher', () => {
  trigger.remove();
  expect(isClosedWidgetHintVisible(trigger)).toBe(false);
});

test('crosses closed shadow boundaries to inspect hidden page containers', () => {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.append(trigger);
  container.append(host);
  expect(host.shadowRoot).toBeNull();
  expect(isClosedWidgetHintVisible(trigger)).toBe(true);
  container.style.display = 'none';
  expect(isClosedWidgetHintVisible(trigger)).toBe(false);
});

test('defers exposure in a background document', () => {
  jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  expect(isClosedWidgetHintVisible(trigger)).toBe(false);
});

test('rechecks ancestor style changes and removes every pending callback on cleanup', async () => {
  jest.useFakeTimers();
  container.style.visibility = 'hidden';
  const onVisibility = jest.fn();
  const stop = observeClosedWidgetHintVisibility(trigger, onVisibility);
  expect(onVisibility).toHaveBeenLastCalledWith(false);
  container.style.visibility = 'visible';
  await Promise.resolve(); // Deliver MutationObserver before its animation frame.
  jest.advanceTimersByTime(20);
  expect(onVisibility).toHaveBeenLastCalledWith(true);
  window.dispatchEvent(new Event('resize'));
  expect(jest.getTimerCount()).toBe(1);
  stop();
  expect(jest.getTimerCount()).toBe(0);
  const count = onVisibility.mock.calls.length;
  container.style.opacity = '0';
  window.dispatchEvent(new Event('resize'));
  await Promise.resolve();
  jest.advanceTimersByTime(20);
  expect(onVisibility).toHaveBeenCalledTimes(count);
});

test('starts exposure when a background document becomes visible', () => {
  jest.useFakeTimers();
  const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const onVisibility = jest.fn();
  const stop = observeClosedWidgetHintVisibility(trigger, onVisibility);
  expect(onVisibility).toHaveBeenLastCalledWith(false);
  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  jest.advanceTimersByTime(20);
  expect(onVisibility).toHaveBeenLastCalledWith(true);
  stop();
});

test('disconnects layout and intersection observers on cleanup', () => {
  const originalResize = window.ResizeObserver;
  const originalIntersection = window.IntersectionObserver;
  const resize = { observe: jest.fn(), disconnect: jest.fn() };
  const intersection = { observe: jest.fn(), disconnect: jest.fn() };
  window.ResizeObserver = jest.fn(() => resize) as unknown as typeof ResizeObserver;
  window.IntersectionObserver = jest.fn(() => intersection) as unknown as typeof IntersectionObserver;
  try {
    const stop = observeClosedWidgetHintVisibility(trigger, jest.fn());
    expect(resize.observe).toHaveBeenCalledWith(trigger);
    expect(intersection.observe).toHaveBeenCalledWith(trigger);
    stop();
    expect(resize.disconnect).toHaveBeenCalledTimes(1);
    expect(intersection.disconnect).toHaveBeenCalledTimes(1);
  } finally {
    window.ResizeObserver = originalResize;
    window.IntersectionObserver = originalIntersection;
  }
});
