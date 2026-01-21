import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Crypto Scanner",
  description: "Scan top 100 futures by MA/EMA levels",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Scanner",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* PWA Icons */}
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

        {/* iOS Splash Screens - iPhone 16 Pro */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)"
          href="/icons/splash-1206x2622.png"
        />
        {/* iPhone 16 Pro Max */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)"
          href="/icons/splash-1320x2868.png"
        />
        {/* Fallback for other devices */}
        <link
          rel="apple-touch-startup-image"
          href="/icons/icon-512.png"
        />
      </head>
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
