import withPWAInit from "@ducanh2912/next-pwa";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Polyfill browser-only globals for pdfjs-dist in Node.js
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

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // next-pwa globs `{src/,}index.{ts,js}` INSIDE this dir, relative to the project root
  // (its docs say "root or src"; 10.2.9 does not look in src/worker by default).
  customWorkerSrc: "src/worker",
  // Precache /offline and serve it when a navigation to an uncached route fails while
  // offline — otherwise the browser shows a blank/error page (the app had no fallback).
  fallbacks: {
    document: "/offline",
  },
  workboxOptions: {
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    clientsClaim: true,
    // Cache names below are repeated in src/worker/cacheNames.ts (the cache janitor,
    // bundled into sw.js from src/worker/) — cacheNames.contract.test.ts pins them.
    // Renamed to -v2 on 2026-11-13: the old caches had grown past their limits (31 GB
    // on one device) through entries workbox-expiration had lost track of; the janitor
    // deletes the old names and any untracked entry. See src/worker/cacheJanitor.ts.
    runtimeCaching: [
      // Supabase API calls — network-first with 24h fallback
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "supabase-api-cache-v2",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
            purgeOnQuotaError: true,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      // Supabase storage IMAGES only — cache-first with 7-day TTL. PDFs and other
      // documents from storage are no longer cached here (they made each entry several
      // MB). Serialised into sw.js by workbox-build: must stay self-contained.
      {
        urlPattern: ({ request, url }) =>
          url.hostname.endsWith(".supabase.co") &&
          url.pathname.startsWith("/storage/v1/") &&
          (request.destination === "image" ||
            /\.(?:png|jpe?g|webp|gif|avif|svg|heic|heif)$/i.test(url.pathname)),
        handler: "CacheFirst",
        options: {
          cacheName: "supabase-images-v2",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
            purgeOnQuotaError: true,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      // Google Fonts
      {
        urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts",
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
      // Self-hosted pdf.js workers (src/lib/pdfWorker.ts) — version-named
      // files are immutable, so cache-first keeps PDF viewing working offline.
      {
        urlPattern: /\/pdf-workers\/pdf\.worker-.*\.mjs$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "pdf-workers",
          expiration: {
            maxEntries: 4,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year (version-named, immutable)
          },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Pin the workspace root to this project. A stray empty lockfile at
  // ~/package-lock.json otherwise makes Next infer the home dir as the root.
  outputFileTracingRoot: __dirname,

  // Audit baseline: 109 strict-mode type errors and an eslint config issue
  // remain post-Vite-migration. Tracked separately. Editors still surface them.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  serverExternalPackages: ['fabric', 'canvas', 'pdfmake', 'html2canvas', '@sparticuz/chromium', 'puppeteer-core', 'unpdf'],
  // regenerate_site_reports (src/lib/mcp/regenerate.ts) launches the packaged Chromium; its brotli
  // archives are read at runtime, so file tracing cannot see them.
  outputFileTracingIncludes: {
    '/api/mcp': ['./node_modules/@sparticuz/chromium/bin/**'],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oltzgidkjxwsukvkomof.supabase.co',
        pathname: '/storage/**',
      },
    ],
  },

  async redirects() {
    return [
      { source: '/issue-reports', destination: '/feedback-management', permanent: true },
      { source: '/suggestions', destination: '/feedback-management', permanent: true },
      { source: '/verification-management', destination: '/feedback-management', permanent: true },
      { source: '/admin-client-preview', destination: '/portal-management', permanent: true },
      { source: '/admin-contractor-preview', destination: '/portal-management', permanent: true },
      { source: '/admin/contractor-access-simulator', destination: '/portal-management', permanent: true },
    ];
  },

  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('fabric', 'canvas');
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    // pdfjs-dist's pdf.mjs declares top-level `var __webpack_exports__`, which
    // shadows the dev runtime's parameter inside next dev's eval-wrapped
    // modules and crashes with "Object.defineProperty called on non-object".
    // Applies to every pdfjs-dist copy (root and react-pdf's nested one).
    config.module.rules.push({
      test: /[\\/]pdfjs-dist[\\/]build[\\/][^\\/]*\.mjs$/,
      loader: join(__dirname, 'pdfjs-shadow-fix-loader.cjs'),
    });
    return config;
  },
};

export default withPWA(nextConfig);
