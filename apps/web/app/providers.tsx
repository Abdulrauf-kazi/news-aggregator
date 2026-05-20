"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { StoriesProvider } from "../lib/stories-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth">
      <StoriesProvider>{children}</StoriesProvider>
    </SessionProvider>
  );
}
