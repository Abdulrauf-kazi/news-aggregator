"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3-force";
import type { GraphEdge, GraphNode } from "../lib/graph";

type PositionedNode = d3.SimulationNodeDatum & GraphNode;
type PositionedEdge = d3.SimulationLinkDatum<PositionedNode> & GraphEdge;

const getLinkEndpointId = (
  endpoint: string | number | PositionedNode,
): string => {
  if (typeof endpoint === "string") {
    return endpoint;
  }
  if (typeof endpoint === "number") {
    return String(endpoint);
  }
  return endpoint.id;
};

export function NewsGraph({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 980, height: 560 });
  const [simNodes, setSimNodes] = useState<PositionedNode[]>([]);
  const [simEdges, setSimEdges] = useState<PositionedEdge[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const nextWidth = Math.max(520, Math.round(entry.contentRect.width));
      const nextHeight = Math.max(420, Math.round(nextWidth * 0.56));
      setDimensions({ width: nextWidth, height: nextHeight });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const storyNodes = nodes.filter((node) => node.type === "story");
    const newNodes = storyNodes.map((n) => ({ ...n })) as PositionedNode[];
    const newEdges = edges
      .filter((edge) => edge.relation === "story-story")
      .map((edge) => ({
        ...edge,
        source: edge.from,
        target: edge.to,
      })) as PositionedEdge[];

    const simulation = d3
      .forceSimulation<PositionedNode>(newNodes)
      .force(
        "link",
        d3
          .forceLink<PositionedNode, PositionedEdge>(newEdges)
          .id((d) => d.id)
          .distance(44),
      )
      .force("charge", d3.forceManyBody().strength(-60))
      .force(
        "center",
        d3.forceCenter(dimensions.width / 2, dimensions.height / 2),
      )
      .force("collide", d3.forceCollide<PositionedNode>().radius(6))
      .alphaDecay(0.06)
      .velocityDecay(0.48)
      .on("tick", () => {
        if (typeof window === "undefined") {
          setSimNodes([...newNodes]);
          setSimEdges([...newEdges]);
          return;
        }
        window.requestAnimationFrame(() => {
          setSimNodes([...newNodes]);
          setSimEdges([...newEdges]);
        });
      });

    const settleTimer = setTimeout(() => {
      simulation.alpha(0.05);
      simulation.stop();
    }, 2500);

    return () => {
      clearTimeout(settleTimer);
      simulation.stop();
    };
  }, [nodes, edges, dimensions]);

  const nodeById = useMemo(
    () => new Map(simNodes.map((node) => [node.id, node])),
    [simNodes],
  );

  const activeNode = activeNodeId ? nodeById.get(activeNodeId) : null;
  const activeNeighbors = useMemo(() => {
    if (!activeNodeId) {
      return new Set<string>();
    }
    const neighbors = new Set<string>();
    for (const edge of simEdges) {
      const sourceId = getLinkEndpointId(edge.source);
      const targetId = getLinkEndpointId(edge.target);
      if (sourceId === activeNodeId) {
        neighbors.add(targetId);
      }
      if (targetId === activeNodeId) {
        neighbors.add(sourceId);
      }
    }
    return neighbors;
  }, [activeNodeId, simEdges]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[400px] relative overflow-hidden bg-white/50"
    >
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1 bg-white/80 border border-[#d6d3d1] rounded-full backdrop-blur-sm">
          <span className="status-dot"></span>
          <span className="text-[10px] font-headline uppercase tracking-wider text-primary">
            {activeNode ? activeNode.label.slice(0, 30) + "..." : "System Idle"}
          </span>
        </div>
      </div>

      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="block"
        role="img"
        aria-label="Intelligence Matrix"
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Dynamic Grid Background */}
        <g opacity="0.05">
          {Array.from({ length: Math.ceil(dimensions.width / 50) }).map((_, i) => (
            <line key={`v-${i}`} x1={i * 50} y1={0} x2={i * 50} y2={dimensions.height} stroke="currentColor" strokeWidth="0.5" />
          ))}
          {Array.from({ length: Math.ceil(dimensions.height / 50) }).map((_, i) => (
            <line key={`h-${i}`} x1={0} y1={i * 50} x2={dimensions.width} y2={i * 50} stroke="currentColor" strokeWidth="0.5" />
          ))}
        </g>

        {simEdges.map((edge) => {
          const source = edge.source as PositionedNode;
          const target = edge.target as PositionedNode;
          if (
            source.x == null ||
            source.y == null ||
            target.x == null ||
            target.y == null
          ) {
            return null;
          }

          const sourceId = source.id;
          const targetId = target.id;
          const edgeActive =
            activeNodeId && (sourceId === activeNodeId || targetId === activeNodeId);
          
          const neighborActive = 
            activeNodeId && (activeNeighbors.has(sourceId) && activeNeighbors.has(targetId));

          return (
            <line
              key={edge.id}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={edgeActive ? "var(--color-accent)" : "#d6d3d1"}
              strokeWidth={edgeActive ? 1.5 : 0.8}
              opacity={edgeActive ? 0.8 : neighborActive ? 0.4 : 0.15}
              className="transition-all duration-300"
            />
          );
        })}

        {simNodes.map((node) => {
          if (node.x == null || node.y == null) {
            return null;
          }
          const isDirectlyActive = node.id === activeNodeId;
          const isNeighborActive = activeNeighbors.has(node.id);
          const isDimmed = activeNodeId && !isDirectlyActive && !isNeighborActive;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              onMouseEnter={() => setActiveNodeId(node.id)}
              onMouseLeave={() => setActiveNodeId(null)}
              className="cursor-crosshair group"
            >
              <circle
                r={isDirectlyActive ? 6 : 3}
                fill={isDirectlyActive ? "var(--color-accent)" : isNeighborActive ? "var(--color-primary)" : "#a8a29e"}
                opacity={isDimmed ? 0.2 : 1}
                filter={isDirectlyActive ? "url(#glow)" : undefined}
                className="transition-all duration-300"
              />
              {isDirectlyActive && (
                <g>
                  <rect
                    x={12}
                    y={-12}
                    width={node.label.length * 6 + 20}
                    height={24}
                    fill="var(--color-primary)"
                    rx={2}
                  />
                  <text
                    x={20}
                    y={4}
                    fontSize={10}
                    fontFamily="var(--font-headline)"
                    fill="white"
                    className="uppercase tracking-widest font-bold"
                  >
                    {node.label.length > 40
                      ? `${node.label.slice(0, 40)}...`
                      : node.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
