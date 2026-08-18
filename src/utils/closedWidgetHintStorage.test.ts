import { ClosedWidgetHintStorage } from './closedWidgetHintStorage';

describe('ClosedWidgetHintStorage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it('should report not shown for a fresh flow', () => {
    expect(ClosedWidgetHintStorage.hasBeenShown('flow-a')).toBe(false);
  });

  it('should report shown after markShown', () => {
    ClosedWidgetHintStorage.markShown('flow-a');
    expect(ClosedWidgetHintStorage.hasBeenShown('flow-a')).toBe(true);
  });

  it('should scope flags by flow id', () => {
    ClosedWidgetHintStorage.markShown('flow-a');
    expect(ClosedWidgetHintStorage.hasBeenShown('flow-b')).toBe(false);
  });

  it('should store the flag under a domain-scoped key', () => {
    ClosedWidgetHintStorage.markShown('flow-a');
    const expectedKey = `punku-chat-hint-shown-${window.location.hostname}-flow-a`;
    expect(window.sessionStorage.getItem(expectedKey)).toBe('true');
  });

  it('should fall back to not shown when sessionStorage is unavailable', () => {
    jest
      .spyOn(Object.getPrototypeOf(window.sessionStorage), 'setItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });

    expect(ClosedWidgetHintStorage.hasBeenShown('flow-a')).toBe(false);
    expect(() => ClosedWidgetHintStorage.markShown('flow-a')).not.toThrow();
  });

  it('should ignore read errors and report not shown', () => {
    jest
      .spyOn(Object.getPrototypeOf(window.sessionStorage), 'getItem')
      .mockImplementation(() => {
        throw new Error('storage read failed');
      });

    expect(ClosedWidgetHintStorage.hasBeenShown('flow-a')).toBe(false);
  });
});
