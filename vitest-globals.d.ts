/// <reference types="vitest/globals" />

// Web ARCHITECTURE_AUDIT.md Strategy 1.
//
// vitest.config.ts sets `globals: true` so test files don't need to
// import `describe`, `it`, `expect`, `vi`. This file declares those
// globals for TypeScript by referencing the Vitest type bundle.
