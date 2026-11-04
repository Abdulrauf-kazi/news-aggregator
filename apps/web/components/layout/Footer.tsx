import Link from "next/link";

const exploreLinks = [
  { href: "/", label: "Home feed" },
  { href: "/live", label: "Live feed" },
  { href: "/news-graph", label: "Story network" },
  { href: "/insights", label: "Insights" },
];

const coverage = ["World news & wire services", "Markets, energy & macro data", "Cyber threat intelligence", "Science, climate & hazards"];

export function Footer() {
  return (
    <footer className="mt-12 w-full border-t border-[#d6d3d1] bg-[#efefec] pt-12 pb-8 text-[#1c1917]">
      <div className="mx-auto max-w-[1600px] px-6 lg:px-12">
        <div className="mb-10 grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link href="/" className="mb-3 inline-block font-headline text-xl font-black uppercase tracking-tight">
              News<span className="text-[#ff3e00]">Monitor</span>
            </Link>
            <p className="text-sm leading-relaxed text-[#57534e]">
              Real-time news from 45 global sources, automatically classified, de-duplicated and linked by meaning.
            </p>
          </div>
          <nav aria-label="Footer">
            <h2 className="mb-4 font-headline text-xs font-bold uppercase tracking-widest text-[#57534e]">Explore</h2>
            <ul className="space-y-2.5 text-sm">
              {exploreLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[#44403c] underline-offset-4 transition-colors hover:text-[#c2410c] hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <h2 className="mb-4 font-headline text-xs font-bold uppercase tracking-widest text-[#57534e]">Coverage</h2>
            <ul className="space-y-2.5 text-sm text-[#44403c]">
              {coverage.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-[#d6d3d1] pt-5 text-[12px] text-[#78716c] sm:flex-row sm:items-center sm:justify-between">
          <p>Topics, duplicates and related stories are produced by on-device sentence-embedding models.</p>
          <p className="font-headline uppercase tracking-widest">News Monitor</p>
        </div>
      </div>
    </footer>
  );
}
