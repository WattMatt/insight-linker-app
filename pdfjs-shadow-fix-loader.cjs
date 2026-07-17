// pdfjs-dist's build output (build/pdf.mjs) is itself a webpack-bundled
// library that declares top-level `var __webpack_require__` and
// `var __webpack_exports__`. Under `next dev`, webpack wraps every module in
// a strict-mode eval() (eval-source-map devtool), where those `var`
// declarations hoist to the top of the eval scope and shadow the outer
// webpack runtime's factory parameters. Webpack renames nested
// `__webpack_require__` but NOT `__webpack_exports__`, so the prepended
// `__webpack_require__.r(__webpack_exports__)` runs against a hoisted
// `undefined` binding and throws:
//   TypeError: Object.defineProperty called on non-object
// Both identifiers are internal to the pdfjs bundle (it exports via a plain
// `export {}` statement), so renaming them is semantics-preserving. With no
// occurrences left, nothing shadows the outer runtime in dev, and production
// output is unaffected in behaviour.
module.exports = function pdfjsShadowFixLoader(source) {
  return source.replace(/__webpack_(require|exports)__/g, "__pdfjs_$1__");
};
