"use client";

import { Suspense } from "react";
import { LiveHome } from "../components/live-home";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function HomeClient({ initialData }: { initialData: any }) {
  return (
    <Suspense fallback={null}>
      <LiveHome initialData={initialData} />
    </Suspense>
  );
}
