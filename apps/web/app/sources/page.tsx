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
      <section className="premium-card rounded-xl p-7 mb-8 bg-gradient-to-r from-slate-50 to-white">
        <h1 className="text-3xl lg:text-4xl font-black font-headline text-primary mb-3">
          Source Catalog
        </h1>
        <p className="text-secondary text-sm max-w-3xl mb-5">
          Live registry of RSS, market, cyber, science, and government feeds.
          Each source contributes to graph relationships and story clustering in
          Redis-backed storage.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-secondary">Configured Sources</p>
            <p className="font-black text-primary text-lg">
              {SOURCE_DEFINITIONS.length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-secondary">Active Sources</p>
            <p className="font-black text-primary text-lg">{activeSources}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-secondary">Stored Stories</p>
            <p className="font-black text-primary text-lg">{stories.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-secondary">Storage Tier</p>
            <p className="font-black text-primary text-lg">Redis DB</p>
          </div>
        </div>
      </section>

      <section className="premium-card rounded-xl overflow-hidden">
        <SourceTable />
      </section>
    </main>
  );
}
