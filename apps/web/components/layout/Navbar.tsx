"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";

export function Navbar() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: session, status } = useSession();
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsModalOpen(prev => !prev);
      }
      if (e.key === "Escape") {
        setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleSidebar = () => {
    window.dispatchEvent(new CustomEvent("toggle-sidebar"));
  };

  return (
    <>
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-[#d6d3d1]">
        <div className="flex justify-between items-center px-6 lg:px-12 h-16 max-w-[1800px] mx-auto">
          <div className="flex items-center gap-10">
            <Link className="flex items-center gap-2" href="/">
              <span className="text-xl font-black text-[#1c1917] uppercase tracking-tight font-headline flex items-center">
                News<span className="text-[#ff3e00] ml-1">Monitor</span>
              </span>
            </Link>
            <div className="hidden lg:flex items-center gap-6 font-headline font-bold text-[11px] uppercase tracking-widest">
              <Link className="text-[#57534e] hover:text-[#1c1917] transition-colors" href="/">Home</Link>
              <Link className="text-[#57534e] hover:text-[#1c1917] transition-colors" href="/news-graph">Network</Link>
              <Link className="text-[#57534e] hover:text-[#1c1917] transition-colors" href="/bookmarks">Archive</Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="hidden md:flex items-center gap-3 bg-[#f5f5f4] border border-[#d6d3d1] hover:border-[#ff3e00] px-3 py-2 rounded-lg transition-all group shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px] text-[#a8a29e] group-hover:text-[#ff3e00]">search</span>
              <span className="text-[13px] font-medium text-[#57534e] group-hover:text-[#1c1917] pr-8 uppercase font-headline">Search intelligence...</span>
              <div className="flex items-center gap-1">
                <span className="modal-kbd">⌘</span>
                <span className="modal-kbd">K</span>
              </div>
            </button>

            <button 
              onClick={toggleSidebar}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-[#d6d3d1] text-[#57534e] hover:text-[#ff3e00] hover:border-[#ff3e00] transition-all shadow-sm"
              title="Toggle Sidebar"
            >
              <span className="material-symbols-outlined text-[20px]">side_navigation</span>
            </button>

            {status === "authenticated" && session?.user ? (
              <div className="relative">
                <button onClick={() => setShowMenu((s) => !s)} className="flex items-center gap-2 px-3 py-2 bg-white border border-[#d6d3d1] rounded-lg">
                  {session.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.user.image} alt={session.user.name || "user"} className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#f5f5f4] flex items-center justify-center text-sm text-[#1c1917]">{(session.user.name || session.user.email || "U")[0]}</div>
                  )}
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-40 bg-white border border-[#d6d3d1] rounded-lg shadow-lg py-2 z-50">
                    <Link href="/" className="block px-4 py-2 text-sm text-[#1c1917] hover:bg-[#f5f5f4]" onClick={() => setShowMenu(false)}>Home</Link>
                    <Link href="/profile" className="block px-4 py-2 text-sm text-[#1c1917] hover:bg-[#f5f5f4]" onClick={() => setShowMenu(false)}>Profile</Link>
                    <button onClick={() => { setShowMenu(false); signOut({ callbackUrl: "/" }); }} className="w-full text-left px-4 py-2 text-sm text-[#ef4444] hover:bg-[#fff5f5]">Sign out</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="hidden md:flex items-center px-4 py-2 bg-white text-[#1c1917] border border-[#d6d3d1] text-[11px] font-headline font-bold uppercase tracking-widest rounded-lg hover:border-[#ff3e00] hover:text-[#ff3e00] transition-all shadow-sm"
                >
                  Sign In
                </Link>

                <Link
                  href="/sign-up"
                  className="hidden md:flex items-center px-4 py-2 bg-[#1c1917] text-white text-[11px] font-headline font-bold uppercase tracking-widest rounded-lg hover:bg-[#ff3e00] transition-all shadow-sm"
                >
                  Sign Up
                </Link>
              </>
            )}

            <Link 
              href="/live"
              className="flex items-center gap-2 px-4 py-2 bg-[#ff3e00] text-white text-[11px] font-headline font-bold uppercase tracking-widest rounded-lg hover:bg-[#e03500] transition-all shadow-sm"
            >
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse shadow-[0_0_8px_white]"></span>
              Live Feed
            </Link>
          </div>
        </div>
      </nav>

      {isModalOpen && (
        <div className="navbar-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="navbar-modal-content" onClick={e => e.stopPropagation()}>
            <div className="relative border-b border-[#d6d3d1]">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#a8a29e] text-2xl">search</span>
              <input 
                autoFocus
                className="w-full bg-white border-none text-[#1c1917] pl-16 py-8 text-xl outline-none font-body" 
                placeholder="Search signals, sources, or events..." 
                type="text" 
              />
            </div>
            
            <div className="p-6 bg-[#fdfdfc]">
              <p className="text-[10px] font-headline font-bold text-[#a8a29e] uppercase tracking-widest px-4 mb-4">Intelligence Quick Actions</p>
              <div className="grid grid-cols-2 gap-3">
                 <div className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-[#d6d3d1] hover:border-[#ff3e00] cursor-pointer group transition-all shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-[#ff3e00]"><span className="material-symbols-outlined">trending_up</span></div>
                    <span className="text-sm font-bold text-[#57534e] group-hover:text-[#1c1917] transition-colors font-headline uppercase">Market Trends</span>
                 </div>
                 <div className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-[#d6d3d1] hover:border-[#ff3e00] cursor-pointer group transition-all shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-[#ff3e00]"><span className="material-symbols-outlined">bolt</span></div>
                    <span className="text-sm font-bold text-[#57534e] group-hover:text-[#1c1917] transition-colors font-headline uppercase">Urgent Signals</span>
                 </div>
              </div>
            </div>

            <div className="p-5 bg-white border-t border-[#d6d3d1] flex items-center justify-between shadow-inner">
                <div className="flex items-center gap-8">
                  <div className="flex items-center gap-2"><span className="modal-kbd">ESC</span><span className="text-[10px] text-[#a8a29e] font-bold uppercase font-headline">Close</span></div>
                  <div className="flex items-center gap-2"><span className="modal-kbd">ENTER</span><span className="text-[10px] text-[#a8a29e] font-bold uppercase font-headline">Search</span></div>
                </div>
                <p className="text-[9px] text-[#a8a29e] font-headline uppercase font-bold tracking-tight">Semantic Engine v4.2</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
