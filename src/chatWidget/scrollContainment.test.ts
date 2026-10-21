import { containScrollEvents } from './scrollContainment';

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
