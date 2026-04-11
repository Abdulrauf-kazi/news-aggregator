import Link from "next/link";
import { getGraphSnapshot } from "../../lib/graph-service";
import { readSourceMetrics, readStoredStories } from "../../lib/story-db";

export const dynamic = "force-dynamic";

const INGESTION_PIPELINE = [
  "Fan-out fetch from all configured source adapters",
  "Normalize source payloads into a StoryNode schema",
  "Infer topic tags and source relationship edges",
  "Persist merged stories in Redis as operational DB",
  "Store ingestion health metrics by source",
  "Materialize graph snapshot cache for the UI/API",
  "Prepare optional archival target for S3 handoff",
];

export default async function IngestionPage() {
  await getGraphSnapshot({ forceRefresh: true });
  const [metrics, stories] = await Promise.all([
    readSourceMetrics(),
    readStoredStories(),
  ]);
  const healthySources = metrics.filter((metric) => metric.ok).length;
  const degradedSources = metrics.filter((metric) => !metric.ok).length;

  return (
    <main className="max-w-[1600px] mx-auto px-6 lg:px-12 py-10">
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-8">
        <div className="xl:col-span-2 premium-card rounded-xl p-7">
          <h1 className="text-3xl lg:text-4xl font-black font-headline text-primary mb-3">
            Ingestion Pipeline
          </h1>
          <p className="text-sm text-secondary mb-5 max-w-2xl">
            Operational monitor for source fan-in, normalization, relationship
            graph production, and Redis-backed storage.
          </p>
          <ol className="list-decimal ml-5 grid gap-2 text-sm text-primary">
            {INGESTION_PIPELINE.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <aside className="premium-card rounded-xl p-6 bg-slate-50">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-secondary mb-3">
            Pipeline Health
          </p>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-secondary">Stored stories</span>
              <span className="font-bold text-primary">{stories.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Healthy sources</span>
              <span className="font-bold text-emerald-700">
                {healthySources}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Degraded sources</span>
              <span className="font-bold text-amber-700">
                {degradedSources}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Metrics tracked</span>
              <span className="font-bold text-primary">{metrics.length}</span>
            </div>
          </div>
          <div className="mt-5 pt-5 border-t border-slate-200">
            <Link
              href="/news-graph"
              className="text-sm font-bold text-accent hover:text-primary transition-colors"
            >
              Open live graph view
            </Link>
          </div>
        </aside>
      </section>

      <section className="premium-card rounded-xl p-6">
        <h2 className="text-xl font-headline font-black text-primary mb-4">
          Recent Source Errors
        </h2>
        <div className="grid gap-2">
          {metrics
            .filter((metric) => !metric.ok)
            .slice(0, 10)
            .map((metric) => (
              <div
                key={metric.sourceId}
                className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2"
              >
                <p className="text-sm font-bold text-amber-900">
                  {metric.sourceId}
                </p>
                <p className="text-xs text-amber-800">
                  {metric.error ?? "Unknown issue"}
                </p>
              </div>
            ))}
          {metrics.filter((metric) => !metric.ok).length === 0 ? (
            <p className="text-sm text-secondary">No recent source errors.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
