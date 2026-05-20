"use client";

import { useEffect, useState } from "react";
import { TOPICS } from "../../lib/sources";
import Link from "next/link";

type InsightData = {
  topicCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  avgScores: Record<string, number>;
  totalStories: number;
};

export default function InsightsPage() {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"topics" | "sources">("topics");

  const mono = "'IBM Plex Mono', monospace";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/live");
        if (res.ok) {
          const liveData = await res.json();
          const stories = liveData.stories || [];
          
          const topicCounts: Record<string, number> = {};
          const sourceCounts: Record<string, number> = {};
          const scoreSums: Record<string, number> = {};
          
          stories.forEach((s: any) => {
            topicCounts[s.topic] = (topicCounts[s.topic] || 0) + 1;
            s.sourceIds.forEach((src: string) => {
              sourceCounts[src] = (sourceCounts[src] || 0) + 1;
            });
            scoreSums[s.topic] = (scoreSums[s.topic] || 0) + s.score;
          });

          const avgScores: Record<string, number> = {};
          Object.keys(scoreSums).forEach(topic => {
            avgScores[topic] = scoreSums[topic] / topicCounts[topic];
          });

          setData({
            topicCounts,
            sourceCounts,
            avgScores,
            totalStories: stories.length
          });
        }
      } catch (err) {
        console.error("Failed to fetch insight data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1c1917]">
        <div className="font-mono text-[12px] text-[#ff3e00] animate-pulse uppercase tracking-[0.2em]">
          RENDERING NEURAL DATA...
        </div>
      </div>
    );
  }

  const maxTopicCount = Math.max(...Object.values(data.topicCounts));
  const sortedSources = Object.entries(data.sourceCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12);

  return (
    <main className="min-h-screen bg-[#1c1917] text-white p-6 lg:p-12 overflow-hidden">
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-2 h-2 bg-[#ff3e00] rounded-full shadow-[0_0_10px_rgba(255,62,0,0.8)]"></span>
            <span className="font-mono text-[10px] font-bold text-[#ff3e00] uppercase tracking-widest">Intelligence Analytics</span>
          </div>
          <h1 className="font-headline text-5xl font-black text-white tracking-tight leading-none mb-4 uppercase">
            SIGNAL <br /> GEOMETRY
          </h1>
          <p className="text-sm text-white/40 max-w-xl font-medium uppercase tracking-[0.15em] leading-relaxed">
            Multi-dimensional analysis of global news vectors, topic saturation, and source distribution metrics.
          </p>
        </div>

        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
           <button 
             onClick={() => setActiveTab("topics")}
             className={`px-6 py-2 rounded-lg font-mono text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'topics' ? 'bg-[#ff3e00] text-white' : 'text-white/40 hover:text-white'}`}
           >
             Topic Saturation
           </button>
           <button 
             onClick={() => setActiveTab("sources")}
             className={`px-6 py-2 rounded-lg font-mono text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'sources' ? 'bg-[#ff3e00] text-white' : 'text-white/40 hover:text-white'}`}
           >
             Source Influence
           </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Visualization Area */}
        <section className="lg:col-span-8 bg-white/5 rounded-[2rem] border border-white/10 p-10 relative overflow-hidden min-h-[600px] flex items-center justify-center">
           {/* Background Grid */}
           <div className="absolute inset-0 opacity-10 pointer-events-none" 
                style={{ backgroundImage: 'radial-gradient(circle, #ff3e00 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
           
           {activeTab === 'topics' ? (
             <div className="relative w-full h-full flex items-center justify-center">
               <svg viewBox="0 0 400 400" className="w-full max-w-[500px] h-auto transform transition-all duration-700">
                 {/* Radar Rings */}
                 {[1, 2, 3, 4].map(r => (
                   <circle key={r} cx="200" cy="200" r={r * 40} fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />
                 ))}
                 
                 {/* Topic Lines & Dots */}
                 {TOPICS.map((topic, i) => {
                   const angle = (i / TOPICS.length) * Math.PI * 2;
                   const count = data.topicCounts[topic] || 0;
                   const radius = 40 + (count / maxTopicCount) * 120;
                   const x = 200 + Math.cos(angle) * radius;
                   const y = 200 + Math.sin(angle) * radius;
                   
                   return (
                     <g key={topic}>
                       <line x1="200" y1="200" x2={x} y2={y} stroke="white" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="4 4" />
                       <circle cx={x} cy={y} r="6" fill="#ff3e00" className="animate-pulse" />
                       <text 
                         x={200 + Math.cos(angle) * (radius + 25)} 
                         y={200 + Math.sin(angle) * (radius + 25)} 
                         fill="white" 
                         fontSize="8" 
                         fontFamily={mono} 
                         textAnchor="middle"
                         className="font-bold uppercase tracking-widest opacity-60"
                       >
                         {topic}
                       </text>
                     </g>
                   );
                 })}

                 {/* Connecting Polygon */}
                 <polygon 
                   points={TOPICS.map((topic, i) => {
                     const angle = (i / TOPICS.length) * Math.PI * 2;
                     const count = data.topicCounts[topic] || 0;
                     const radius = 40 + (count / maxTopicCount) * 120;
                     return `${200 + Math.cos(angle) * radius},${200 + Math.sin(angle) * radius}`;
                   }).join(' ')}
                   fill="#ff3e00"
                   fillOpacity="0.15"
                   stroke="#ff3e00"
                   strokeWidth="2"
                 />
               </svg>
               <div className="absolute top-4 left-4 font-mono text-[9px] text-white/30 uppercase tracking-[0.4em]">
                 Spatial Topic Distribution (Normalized)
               </div>
             </div>
           ) : (
             <div className="w-full grid grid-cols-3 md:grid-cols-4 gap-8">
               {sortedSources.map(([id, count]) => (
                 <div key={id} className="group relative flex flex-col items-center">
                    <div 
                      className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center transition-all group-hover:border-[#ff3e00] group-hover:bg-[#ff3e00]/10 overflow-hidden relative"
                      style={{ transform: `scale(${0.8 + (count / sortedSources[0][1]) * 0.4})` }}
                    >
                      <span className="font-mono text-[14px] font-black group-hover:text-[#ff3e00] transition-colors uppercase">{id.slice(0, 3)}</span>
                      {/* Animated Rings */}
                      <div className="absolute inset-0 border border-[#ff3e00]/20 rounded-full animate-ping opacity-0 group-hover:opacity-100"></div>
                    </div>
                    <p className="mt-4 font-mono text-[9px] font-bold text-white/40 uppercase tracking-widest text-center group-hover:text-white transition-colors">{id}</p>
                    <p className="font-mono text-[8px] text-[#ff3e00] font-black">{count} EVENTS</p>
                 </div>
               ))}
             </div>
           )}
        </section>

        {/* Right Column: Key Metrics */}
        <section className="lg:col-span-4 space-y-8">
           <div className="bg-white/5 rounded-[2rem] border border-white/10 p-8">
              <h3 className="font-mono text-[10px] font-black text-white/40 uppercase tracking-[0.4em] mb-8">System Totals</h3>
              <div className="space-y-8">
                <div>
                   <p className="text-[9px] font-mono text-[#ff3e00] font-bold uppercase tracking-widest mb-1">TOTAL EVENTS</p>
                   <p className="text-5xl font-black tracking-tighter">{data.totalStories}</p>
                </div>
                <div>
                   <p className="text-[9px] font-mono text-[#ff3e00] font-bold uppercase tracking-widest mb-1">ACTIVE SOURCES</p>
                   <p className="text-5xl font-black tracking-tighter">{Object.keys(data.sourceCounts).length}</p>
                </div>
                <div>
                   <p className="text-[9px] font-mono text-[#ff3e00] font-bold uppercase tracking-widest mb-1">DATA TIER</p>
                   <p className="text-3xl font-black tracking-widest uppercase">PROTOTYPE-1</p>
                </div>
              </div>
           </div>

           <div className="bg-[#ff3e00] rounded-[2rem] p-8 text-[#1c1917]">
              <h3 className="font-mono text-[10px] font-black text-[#1c1917]/50 uppercase tracking-[0.4em] mb-6">Neural Insights</h3>
              <div className="space-y-4">
                 {Object.entries(data.avgScores)
                   .sort(([,a], [,b]) => b - a)
                   .slice(0, 3)
                   .map(([topic, score]) => (
                     <div key={topic} className="bg-black/5 rounded-xl p-4 flex justify-between items-center border border-black/5">
                        <span className="font-mono text-[11px] font-black uppercase tracking-widest">{topic}</span>
                        <div className="text-right">
                           <span className="font-mono text-[12px] font-black">{score.toFixed(1)}</span>
                           <p className="text-[8px] font-mono font-bold opacity-50 uppercase">AVG SCORE</p>
                        </div>
                     </div>
                   ))}
              </div>
              <p className="mt-6 text-[11px] font-bold leading-relaxed uppercase opacity-80">
                Top signal clusters identified in the current temporal window.
              </p>
           </div>
        </section>
      </div>

      <footer className="mt-12 pt-8 border-t border-white/5 flex justify-between items-center">
         <div className="flex gap-8">
            <Link href="/" className="font-mono text-[9px] font-bold text-white/30 hover:text-[#ff3e00] transition-colors uppercase tracking-[0.3em]">
               Return to Feed
            </Link>
            <Link href="/news-graph" className="font-mono text-[9px] font-bold text-white/30 hover:text-[#ff3e00] transition-colors uppercase tracking-[0.3em]">
               Topology View
            </Link>
         </div>
         <div className="font-mono text-[9px] text-white/20 uppercase tracking-widest">
            STABLE_RELEASE_v0.92 // SYNC_OK
         </div>
      </footer>
    </main>
  );
}
