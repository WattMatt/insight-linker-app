// Polyfill browser-only globals for pdfjs-dist in Node.js build workers
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      this.is2D = true; this.isIdentity = true;
    }
    inverse() { return new DOMMatrix(); }
    multiply() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
  };
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    addPath() {} closePath() {} moveTo() {} lineTo() {}
    bezierCurveTo() {} quadraticCurveTo() {} arc() {} arcTo() {} rect() {}
  };
}
