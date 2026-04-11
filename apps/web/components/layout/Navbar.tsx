import Link from "next/link";

export function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-[#efefec] border-b border-neutral-500">
      <div className="flex justify-between items-center px-6 lg:px-12 h-16 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-10">
          <Link className="flex items-center gap-2" href="/">
            <span className="text-xl font-black text-primary uppercase tracking-tight font-headline flex items-center">
              News<span className="text-accent ml-1">Monitor</span>
            </span>
          </Link>
          <div className="hidden lg:flex items-center gap-6 font-headline font-bold text-[12px] uppercase tracking-wider">
            <Link
              className="text-secondary hover:text-primary transition-colors"
              href="/"
            >
              Home
            </Link>
            <Link
              className="text-secondary hover:text-primary transition-colors relative group"
              href="/news-graph"
            >
              Graph
              <span className="absolute -bottom-1 left-0 w-full h-0.5 bg-accent transform scale-x-0 group-hover:scale-x-100 transition-transform"></span>
            </Link>
            <Link
              className="text-secondary hover:text-primary transition-colors"
              href="/ingestion"
            >
              Ingestion
            </Link>
            <Link
              className="text-secondary hover:text-primary transition-colors"
              href="/sources"
            >
              Sources
            </Link>
            <Link
              className="text-secondary hover:text-primary transition-colors"
              href="/bookmarks"
            >
              Bookmarks
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center bg-white rounded-md px-3 py-1.5 border border-neutral-400">
            <span className="material-symbols-outlined text-[18px] text-secondary">
              search
            </span>
            <input
              className="bg-transparent border-none text-sm focus:ring-0 outline-none placeholder:text-secondary/60 w-32"
              placeholder="Search news..."
              type="text"
            />
          </div>
          <Link 
            href="/live"
            className="text-[11px] uppercase tracking-wider font-semibold text-secondary border border-neutral-400 rounded-md px-2 py-1 hover:bg-primary hover:text-white hover:border-primary transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"></span>
            Live
          </Link>
        </div>
      </div>
    </nav>
  );
}
