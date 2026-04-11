export function Footer() {
  return (
    <footer className="w-full bg-[#efefec] text-primary border-t border-neutral-500 pt-10 pb-8 mt-12">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
          <div>
            <span className="text-xl font-black font-headline uppercase tracking-tight mb-4 block">
              News<span className="text-accent">Monitor</span>
            </span>
            <p className="text-secondary text-sm leading-relaxed">
              Realtime multi-source news relationship intelligence.
            </p>
          </div>
          <div>
            <h4 className="font-headline font-bold text-xs uppercase tracking-widest text-secondary mb-4">
              Feeds
            </h4>
            <ul className="space-y-2 text-sm text-secondary">
              <li>RSS / Atom</li>
              <li>GDELT / Hacker News / GitHub</li>
              <li>Finance / Geo / Cyber APIs</li>
            </ul>
          </div>
          <div>
            <h4 className="font-headline font-bold text-xs uppercase tracking-widest text-secondary mb-4">
              Storage
            </h4>
            <p className="text-sm text-secondary">
              Redis for active cache/DB, S3 planned for archive.
            </p>
          </div>
        </div>
        <div className="pt-5 border-t border-neutral-400 flex justify-between items-center gap-4">
          <p className="text-secondary text-[11px] font-medium tracking-wide">
            LIVE MONITORING CONSOLE
          </p>
          <p className="text-secondary text-[11px] uppercase tracking-widest">
            Realtime graph intelligence
          </p>
        </div>
      </div>
    </footer>
  );
}
