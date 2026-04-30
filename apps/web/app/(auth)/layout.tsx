import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | NewsMonitor Intelligence Terminal",
  description: "Sign in to access your real-time intelligence feed.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Hide global nav + footer for auth pages. */}
      <style>{`
        nav  { display: none !important; }
        footer { display: none !important; }
        /* Remove the pt-16 added by root layout for the nav */
        body > div > div.flex-grow { padding-top: 0 !important; }
      `}</style>
      {children}
    </>
  );
}
