/* eslint-env browser */
// A small behavioral fixture, not copied vendor code. It reproduces the
// Museum loader's cancellation, hidden path, delayed handlers, and host replay.
// Force this contract on all engines, even those the vendor currently excludes.
window.__hostDiagnostics = { cancellations: 0, replays: 0, opens: 0, settled: 0 };
const originalOpen = window.open;
window.open = function (...args) {
  window.__hostDiagnostics.opens += 1;
  return originalOpen.apply(this, args);
};

if (new URLSearchParams(window.location.search).get('nitro') === 'true') {
  const nativePreventDefault = Event.prototype.preventDefault;
  const addElementListener = HTMLElement.prototype.addEventListener;
  HTMLElement.prototype.addEventListener = function (type, listener, options) {
    if (type !== 'click' || !listener) return addElementListener.call(this, type, listener, options);
    return addElementListener.call(this, type, function (event) {
      const invoke = () => typeof listener === 'function'
        ? listener.call(this, event) : listener.handleEvent(event);
      if (event.nitroPromise) event.nitroPromise.then(invoke);
      else invoke();
    }, options);
  };
  window.addEventListener('click', (event) => {
    if (!event.isTrusted || event.button !== 0) return;
    if (event.target.tagName === 'A' && event.target.target === '_blank') return;
    const target = event.target;
    const outsidePath = event.composedPath();
    event.composedPath = () => outsidePath;
    event.repeatDefaultIfNeeded = true;
    event.nitroDefaultPrevented = false;
    event.nitroPromise = new Promise((resolve) => setTimeout(resolve, 50));
    nativePreventDefault.call(event);
    Object.defineProperty(event, 'defaultPrevented', { get: () => event.nitroDefaultPrevented });
    event.preventDefault = () => { event.nitroDefaultPrevented = true; };
    window.__hostDiagnostics.cancellations += 1;
    window.__hostDiagnostics.target = target.tagName;
    event.nitroPromise.then(() => {
      if (!event.nitroDefaultPrevented) {
        window.__hostDiagnostics.replays += 1;
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      }
      window.__hostDiagnostics.settled += 1;
    });
  }, true);
}
