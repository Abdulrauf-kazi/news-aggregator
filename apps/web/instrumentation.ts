// Runs once when the Next.js server starts (dev and production).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startDemoNewsScheduler } = await import("./lib/demo-news");
  startDemoNewsScheduler();
}
