// Read connectivity defensively. Returns `true` unless we can positively determine we're
// offline. Guards SSR / non-browser envs (Node exposes a `navigator` global with no
// `onLine` property, so a bare `navigator.onLine` reads `undefined` → falsy → a false
// "offline" on first render/hydration). Browser code still gets the real value.
export function getOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
}
