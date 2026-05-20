"use client";

import React from "react";
import HorizonSidebar from "../../components/horizon-sidebar-v2";

export default function IntelFeedPage() {
  // Required handler for the sidebar
  const handleNewsClick = (item: any) => {
    console.log("Selected signal:", item);
  };

  return (
    <main className="flex min-h-screen bg-[#efefec]">
      <div className="flex-1 p-10">
        <h1 className="text-4xl font-black uppercase text-[#1c1917]">Intelligence Feed</h1>
        <p className="text-[#57534e] mt-2 font-medium uppercase tracking-widest">
          Active monitoring of global signals...
        </p>
      </div>
      
      <aside className="w-[420px] border-l border-[#d6d3d1] bg-white h-screen sticky top-0">
        <HorizonSidebar onNewsClick={handleNewsClick} />
      </aside>
    </main>
  );
}
