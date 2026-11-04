// One palette for every topic indicator (graph nodes, legend, feed chips) so a
// colour means the same thing everywhere. Hues are spread around the wheel and
// all are >= 3:1 against white, so they read as markers next to dark text.
export const TOPIC_COLORS: Record<string, string> = {
  Macro: "#d97706",
  Energy: "#059669",
  Cyber: "#7c3aed",
  Geopolitics: "#dc2626",
  Climate: "#0284c7",
  Defense: "#64748b",
  AI: "#2563eb",
  Logistics: "#db2777",
};

export const topicColor = (topic?: string) => (topic && TOPIC_COLORS[topic]) || "#78716c";
