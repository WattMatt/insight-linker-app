import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "dist/**",
      "public/**",
      "supabase/**",
      "docs/**",
      "next-env.d.ts",
      "next.config.mjs",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Post-Vite-migration baseline: ~524 style/type errors across the tree
    // (458 no-explicit-any, 54 no-unescaped-entities, etc). Downgrade to warn so
    // `npm run lint` is a usable gate for the rules that actually catch runtime
    // bugs — instead of always failing on legacy noise. These stay VISIBLE as
    // warnings; promote + fix them incrementally over time.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "prefer-const": "warn",
      // The bug class this harness exists to catch (a misplaced hook shipped the
      // React #303 crash to prod). Keep it hard-failing so it can never ship again.
      "react-hooks/rules-of-hooks": "error",
    },
  },
];

export default eslintConfig;
