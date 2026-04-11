/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Galactic Editor | Intelligence Pulse",
  description: "Precision editorial for the digital age.",
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
        <Navbar />
        <div className="flex-grow pt-16">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
