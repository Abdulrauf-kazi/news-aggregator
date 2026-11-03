/**
 * Generate one fresh set of demo stories now (replaces the previous set).
 *
 *   bun scripts/generate-demo-news.ts          # run one cycle
 *   bun scripts/generate-demo-news.ts --status # show status only
 *
 * Reads OPENROUTER_API_KEY, OPENROUTER_MODEL and MONGODB_URI from .env.local
 * (bun loads it automatically). The dev server picks the new stories up within
 * about 20 seconds; no restart needed.
 */
export {};

const { getDemoStatus, runDemoNewsCycle } = await import("../lib/demo-news");

if (process.argv.includes("--status")) {
  console.log(JSON.stringify(await getDemoStatus(), null, 2));
  process.exit(0);
}

const result = await runDemoNewsCycle({ reason: "script" });
if (result.skipped) {
  console.error(`Skipped: ${result.skipped}`);
  process.exit(1);
}
console.log(`Generated ${result.generated.length}/${result.requested} stories with ${result.model}.`);
for (const call of result.calls) {
  console.log(`  ${call.ok ? "ok  " : "FAIL"} ${Math.round(call.ms / 1000)}s  ${call.sources.join(", ")}${call.error ? `  -> ${call.error}` : ""}`);
}
if (result.failed.length) {
  console.log(`Kept the previous story (if any) for: ${result.failed.map((f) => f.sourceId).join(", ")}`);
}
process.exit(result.generated.length > 0 ? 0 : 1);
