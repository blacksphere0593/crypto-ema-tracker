import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crypto EMA Tracker",
  description: "Track cryptocurrency prices above EMA200",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
