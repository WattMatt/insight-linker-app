// Drive navigator.onLine in jsdom. jsdom exposes navigator.onLine as a getter that
// always returns true and isn't writable, so the offline code paths can never run
// without overriding it. setOnline replaces the getter; dispatch the matching
// 'online'/'offline' event yourself to trigger listeners.
export function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}
