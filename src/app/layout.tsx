import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "@/index.css";

export const metadata: Metadata = {
  title: "WM Compliance Inspector",
  description: "Professional compliance inspection and reporting system",
  authors: [{ name: "Watson Mattheus" }],
  manifest: "/manifest.json",
  openGraph: {
    title: "WM Compliance Inspector",
    description: "Professional compliance inspection and reporting system",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" href="/icon-192.png?v=2" />
        <link rel="shortcut icon" href="/favicon.ico?v=2" />
        <link rel="apple-touch-icon" href="/icon-192.png?v=2" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
