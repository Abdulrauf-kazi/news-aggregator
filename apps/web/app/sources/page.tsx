import { SourceTable } from "../../components/source-table";
import { getGraphSnapshot } from "../../lib/graph-service";
import { readStoredStories } from "../../lib/story-db";
import { SOURCE_DEFINITIONS } from "../../lib/sources";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  await getGraphSnapshot({ forceRefresh: true });
  const stories = await readStoredStories();
  const activeSources = new Set(stories.flatMap((story) => story.sourceIds))
    .size;

  return (
    <main className="max-w-[1600px] mx-auto px-6 lg:px-12 py-10">
      <section className="premium-card rounded-2xl p-10 mb-10 bg-white border border-[#d6d3d1] shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <span className="status-dot"></span>
          <span className="tag text-[#ff3e00]">Network Registry</span>
        </div>
        <h1 className="text-4xl font-black font-headline text-[#1c1917] mb-4 uppercase tracking-tight leading-none">
          Source Catalog
        </h1>
        <p className="text-[#57534e] text-sm max-w-3xl mb-8 font-medium leading-relaxed">
          Live registry of RSS, market, cyber, science, and government feeds.
          Each source contributes to graph relationships and story clustering in
          Redis-backed storage.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
          <div className="rounded-xl border border-[#d6d3d1] bg-[#fbfbf9] px-6 py-5 shadow-inner">
            <p className="text-[10px] text-[#a8a29e] font-headline font-bold uppercase tracking-widest mb-1">Configured</p>
            <p className="font-black text-[#1c1917] text-2xl font-headline">
              {SOURCE_DEFINITIONS.length}
            </p>
          </div>
          <div className="rounded-xl border border-[#d6d3d1] bg-[#fbfbf9] px-6 py-5 shadow-inner">
            <p className="text-[10px] text-[#a8a29e] font-headline font-bold uppercase tracking-widest mb-1">Active</p>
            <p className="font-black text-[#1c1917] text-2xl font-headline">{activeSources}</p>
          </div>
          <div className="rounded-xl border border-[#d6d3d1] bg-[#fbfbf9] px-6 py-5 shadow-inner">
            <p className="text-[10px] text-[#a8a29e] font-headline font-bold uppercase tracking-widest mb-1">Signals</p>
            <p className="font-black text-[#1c1917] text-2xl font-headline">{stories.length}</p>
          </div>
          <div className="rounded-xl border border-[#d6d3d1] bg-[#fbfbf9] px-6 py-5 shadow-inner">
            <p className="text-[10px] text-[#a8a29e] font-headline font-bold uppercase tracking-widest mb-1">Tier</p>
            <p className="font-black text-[#1c1917] text-2xl font-headline uppercase">Redis</p>
          </div>
        </div>
      </section>

      <section className="premium-card rounded-2xl overflow-hidden border border-[#d6d3d1] bg-white shadow-xl">
        <SourceTable />
      </section>
    </main>
  );
}
