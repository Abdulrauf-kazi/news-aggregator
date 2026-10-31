/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "News Monitor | Real-time news intelligence",
  description:
    "Real-time news from 45 global sources, classified, de-duplicated and linked by semantic similarity.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface font-body text-primary min-h-screen flex flex-col">
        <Providers>
          <a href="#main-content" className="skip-link">Skip to content</a>
          <Navbar />
          <div id="main-content" className="flex-grow pt-16">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
