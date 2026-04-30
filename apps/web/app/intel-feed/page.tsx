import HorizonSidebar from "@/components/horizon-sidebar-v2";

export const metadata = {
  title: "Intel Feed | News Intelligence Terminal",
  description:
    "Real-time intelligence feed powered by Horizon.",
};

export default function IntelFeedPage() {
  return (
    <main
      style={{
        display: "flex",
        height: "100vh",
        background: "#efefec",
        overflow: "hidden",
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          color: "#a8a29e",
          borderRight: "1px solid #d6d3d1",
          background: "#efefec",
        }}
      >
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
          <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="0.5" />
          <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="0.5" />
        </svg>
        <p
          style={{
            fontSize: "11px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Main Terminal Area
        </p>
        <p
          style={{
            fontSize: "9px",
            color: "#a8a29e",
            letterSpacing: "0.06em",
          }}
        >
          Horizon sidebar → right
        </p>
      </div>

      <aside style={{ width: "420px", borderLeft: "1px solid #d6d3d1", background: "#ffffff", padding: "16px" }}>
        <HorizonSidebar />
      </aside>
    </main>
  );
}
