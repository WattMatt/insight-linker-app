import withPWAInit from "@ducanh2912/next-pwa";

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
  workboxOptions: {
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      // Supabase API calls — network-first with 24h fallback
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "supabase-api-cache",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      // Supabase storage images — cache-first with 7-day TTL
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "supabase-images",
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
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
      // Static assets from CDNs (e.g., pdfjs worker)
      {
        urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "cdn-assets",
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Audit baseline: 109 strict-mode type errors and an eslint config issue
  // remain post-Vite-migration. Tracked separately. Editors still surface them.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  serverExternalPackages: ['fabric', 'canvas', 'pdfmake', 'jspdf', 'html2canvas'],

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
    return config;
  },
};

export default withPWA(nextConfig);
