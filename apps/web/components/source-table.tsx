import { readSourceMetrics, readStoredStories } from "../lib/story-db";
import { SOURCE_DEFINITIONS } from "../lib/sources";

const statusClass = (ok: boolean) =>
  ok
    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
    : "bg-amber-100 text-amber-700 border border-amber-200";

export async function SourceTable() {
  const [metrics, stories] = await Promise.all([
    readSourceMetrics(),
    readStoredStories(),
  ]);

  const metricBySource = new Map(
    metrics.map((metric) => [metric.sourceId, metric]),
  );
  const sourceStoryMap = new Map<string, number>();
  const sourceLastSeenMap = new Map<string, string>();

  for (const story of stories) {
    for (const sourceId of story.sourceIds) {
      sourceStoryMap.set(sourceId, (sourceStoryMap.get(sourceId) ?? 0) + 1);
      const existing = sourceLastSeenMap.get(sourceId);
      if (!existing || Date.parse(existing) < Date.parse(story.timestamp)) {
        sourceLastSeenMap.set(sourceId, story.timestamp);
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-secondary">
              Source
            </th>
            <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-secondary">
              Category
            </th>
            <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-secondary">
              Kind
            </th>
            <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-secondary">
              Endpoint
            </th>
            <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-secondary">
              DB Stories
            </th>
            <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-secondary">
              Last Seen
            </th>
            <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-secondary">
              Ingestion
            </th>
          </tr>
        </thead>
        <tbody>
          {SOURCE_DEFINITIONS.map((source) => {
            const metric = metricBySource.get(source.id);
            const count = sourceStoryMap.get(source.id) ?? 0;
            const lastSeen = sourceLastSeenMap.get(source.id);
            return (
              <tr
                key={source.id}
                className="border-t border-slate-100 align-top"
              >
                <td className="px-4 py-3">
                  <p className="font-semibold text-primary leading-5">
                    {source.label}
                  </p>
                  <p className="text-[11px] text-secondary mt-1">
                    {source.tags.join(" | ")}
                  </p>
                </td>
                <td className="px-4 py-3 capitalize text-secondary">
                  {source.category}
                </td>
                <td className="px-4 py-3 uppercase text-secondary">
                  {source.kind}
                </td>
                <td className="px-4 py-3">
                  <code className="text-[11px] text-primary break-all">
                    {source.endpoint}
                  </code>
                </td>
                <td className="px-4 py-3 font-semibold text-primary">
                  {count}
                </td>
                <td className="px-4 py-3 text-secondary text-xs">
                  {lastSeen ? new Date(lastSeen).toLocaleString() : "-"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex text-xs px-2 py-1 rounded-full font-semibold ${statusClass(metric?.ok ?? false)}`}
                  >
                    {metric?.ok ? "live" : "fallback"}
                  </span>
                  <p className="text-[11px] text-secondary mt-1">
                    {metric
                      ? `${metric.storyCount} items`
                      : "No ingestion run yet"}
                  </p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
