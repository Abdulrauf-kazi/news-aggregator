"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3-force";
import type { GraphEdge, GraphNode } from "../lib/graph";

type PositionedNode = d3.SimulationNodeDatum & GraphNode & {
  color?: string;
  size?: number;
  baseSize?: number;
  phaseOffset?: number;
};
type PositionedEdge = d3.SimulationLinkDatum<PositionedNode> & GraphEdge;

export function NewsGraph({
  nodes,
  edges,
  onNodeClick,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (nodeId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 980, height: 560 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  
  const simulationRef = useRef<d3.Simulation<PositionedNode, PositionedEdge> | null>(null);
  const dataRef = useRef<{ nodes: PositionedNode[]; edges: PositionedEdge[] }>({ nodes: [], edges: [] });
  
  // Interaction state
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const isDraggingRef = useRef(false);
  const draggedNodeRef = useRef<PositionedNode | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const pointerDownMetaRef = useRef({ x: 0, y: 0, time: 0 });

  const getLinkEndpointId = (endpoint: string | number | PositionedNode): string => {
    if (typeof endpoint === "string") return endpoint;
    if (typeof endpoint === "number") return String(endpoint);
    return endpoint.id;
  };

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const nextWidth = Math.max(10, Math.round(width));
      const nextHeight = Math.max(10, Math.round(height));
      setDimensions(prev => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const storyNodes = nodes.filter((node) => node.type === "story");
    const newNodes = storyNodes.map((n) => {
      const colorMatch = n.topic ? stringToColor(n.topic) : "#a8a29e";
      const baseSize = Math.random() * 2 + 5;
      return { 
        ...n, 
        color: colorMatch, 
        size: baseSize, 
        baseSize,
        phaseOffset: Math.random() * Math.PI * 2
      };
    }) as PositionedNode[];
    
    const newEdges = edges
      .filter((edge) => edge.relation === "story-story")
      .map((edge) => ({
        ...edge,
        source: edge.from,
        target: edge.to,
      })) as PositionedEdge[];

    dataRef.current = { nodes: newNodes, edges: newEdges };

    const simulation = d3
      .forceSimulation<PositionedNode>(newNodes)
      .force("link", d3.forceLink<PositionedNode, PositionedEdge>(newEdges).id((d) => d.id).distance(90))
      .force("charge", d3.forceManyBody().strength(-250).distanceMax(500))
      .force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2).strength(0.06))
      .force("collide", d3.forceCollide<PositionedNode>().radius(18).iterations(3))
      // Subtle radial force to keep elements organic and centered
      .force("radial", d3.forceRadial(dimensions.height / 3.5, dimensions.width / 2, dimensions.height / 2).strength(0.03))
      .alphaDecay(0.01) // Slow down decay to make animation last longer
      .alphaTarget(0.02) // Keep a low constant energy so it never fully stops
      .velocityDecay(0.45);

    // Custom force for aesthetic wandering
    simulation.force("wander", () => {
      newNodes.forEach(node => {
        if (!node.fx && !node.fy) {
          node.vx = (node.vx || 0) + (Math.random() - 0.5) * 0.25;
          node.vy = (node.vy || 0) + (Math.random() - 0.5) * 0.25;
        }
      });
    });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, dimensions]);

  // Handle native wheel event for zooming
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      
      // Smooth zoom scaling based on delta
      const scaleFactor = Math.pow(0.995, e.deltaY);
      const t = transformRef.current;
      
      // Limits zoom
      const newK = Math.max(0.15, Math.min(t.k * scaleFactor, 6));
      const actualScale = newK / t.k;
      
      t.x = clientX - (clientX - t.x) * actualScale;
      t.y = clientY - (clientY - t.y) * actualScale;
      t.k = newK;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      time += 0.03;
      const { width, height } = dimensions;
      const transform = transformRef.current;
      
      // Aesthetic Light Theme Background
      ctx.fillStyle = "#f5f5f4";
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      // Apply Pan and Zoom
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Grid Background relative to zoom
      ctx.strokeStyle = "rgba(0, 0, 0, 0.03)";
      ctx.lineWidth = 1 / transform.k;
      const gridSize = 60;
      
      // Calculate visible viewport bounds for infinite grid
      const startX = -transform.x / transform.k;
      const startY = -transform.y / transform.k;
      const endX = startX + width / transform.k;
      const endY = startY + height / transform.k;

      ctx.beginPath();
      for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
      }
      for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
      }
      ctx.stroke();

      const { nodes, edges } = dataRef.current;
      const activeId = hoveredNodeId;
      
      const activeNeighbors = new Set<string>();
      if (activeId) {
        edges.forEach(edge => {
          const sourceId = getLinkEndpointId(edge.source);
          const targetId = getLinkEndpointId(edge.target);
          if (sourceId === activeId) activeNeighbors.add(targetId);
          if (targetId === activeId) activeNeighbors.add(sourceId);
        });
      }

      // Render Edges
      edges.forEach((edge) => {
        const source = edge.source as PositionedNode;
        const target = edge.target as PositionedNode;
        if (source.x == null || source.y == null || target.x == null || target.y == null) return;

        const sourceId = source.id;
        const targetId = target.id;
        const isActive = activeId && (sourceId === activeId || targetId === activeId);
        const isNeighbor = activeId && (activeNeighbors.has(sourceId) && activeNeighbors.has(targetId));
        
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        
        if (isActive) {
          ctx.strokeStyle = "rgba(255, 62, 0, 0.6)"; // Theme accent
          ctx.lineWidth = 2.5 / transform.k;
        } else if (isNeighbor) {
          ctx.strokeStyle = "rgba(168, 162, 158, 0.5)"; // Outline color
          ctx.lineWidth = 1.5 / transform.k;
        } else {
          ctx.strokeStyle = "rgba(214, 211, 209, 0.6)"; // Muted edge
          ctx.lineWidth = 1 / transform.k;
        }
        ctx.stroke();

        // Flowing data particles moving along highly weighted edges
        if (!activeId && edge.weight > 0.3) {
          const t = (time * 0.4 + (source.x * 0.01)) % 1;
          const px = source.x + (target.x - source.x) * t;
          const py = source.y + (target.y - source.y) * t;
          
          ctx.beginPath();
          ctx.arc(px, py, 2.5 / transform.k, 0, 2 * Math.PI);
          ctx.fillStyle = source.color || "#0a0a0a";
          ctx.fill();
        }
      });

      // Render Nodes
      nodes.forEach((node) => {
        if (node.x == null || node.y == null) return;
        
        const isDirectlyActive = node.id === activeId;
        const isNeighborActive = activeNeighbors.has(node.id);
        const isDimmed = activeId && !isDirectlyActive && !isNeighborActive;
        
        // Organic breathing animation size
        const breath = Math.sin(time * 1.5 + (node.phaseOffset || 0)) * 1.5;
        const base = node.baseSize || 5;
        const radius = isDirectlyActive ? 14 : isNeighborActive ? 10 : Math.max(3, base + breath);
        const color = isDirectlyActive ? "#ff3e00" : isNeighborActive ? "#0a0a0a" : (node.color || "#a8a29e");
        
        // Premium drop shadows (adjusted for zoom scale)
        if (!isDimmed) {
          ctx.shadowBlur = (isDirectlyActive ? 15 : 6) / transform.k;
          ctx.shadowColor = isDirectlyActive ? "rgba(255, 62, 0, 0.4)" : "rgba(0, 0, 0, 0.15)";
          ctx.shadowOffsetY = 2 / transform.k;
        } else {
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius / transform.k, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.globalAlpha = isDimmed ? 0.15 : 1;
        ctx.fill();
        
        // Aesthetic inner dot
        if (!isDimmed && radius > 5) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, (radius * 0.35) / transform.k, 0, 2 * Math.PI);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        }

        // Reset state
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Render Tooltip / Label for hovered nodes, their neighbors, or if showLabels is enabled
        if (isDirectlyActive || isNeighborActive || showLabels) {
          const fontSize = (isDirectlyActive ? 12 : 10) / transform.k;
          ctx.font = `${isDirectlyActive ? 'bold' : '500'} ${fontSize}px 'IBM Plex Mono', monospace`;
          const label = node.label.length > 40 ? `${node.label.slice(0, 40)}...` : node.label;
          const textWidth = ctx.measureText(label).width;
          
          const padX = 8 / transform.k;
          const padY = 4 / transform.k;
          const boxX = node.x + (isDirectlyActive ? 16 : 12) / transform.k;
          const boxY = node.y - (isDirectlyActive ? 20 : 16) / transform.k;
          
          // Tooltip Background
          ctx.fillStyle = isDirectlyActive ? "rgba(255, 255, 255, 0.98)" : "rgba(255, 255, 255, 0.85)";
          ctx.shadowBlur = (isDirectlyActive ? 12 : 4) / transform.k;
          ctx.shadowColor = "rgba(0,0,0,0.08)";
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, textWidth + padX * 2, fontSize + padY * 2, 4 / transform.k);
          ctx.fill();
          ctx.shadowBlur = 0;
          
          // Tooltip Border
          if (isDirectlyActive) {
            ctx.strokeStyle = "#ff3e00";
            ctx.lineWidth = 1.5 / transform.k;
          } else {
            ctx.strokeStyle = "#d6d3d1";
            ctx.lineWidth = 1 / transform.k;
          }
          ctx.stroke();
          
          // Tooltip Text
          ctx.fillStyle = isDirectlyActive ? "#ff3e00" : "#475e8b";
          ctx.fillText(label, boxX + padX, boxY + fontSize + padY - 1/transform.k);
        }
      });

      ctx.restore();
      animationFrameId = window.requestAnimationFrame(render);
    };

    render();
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [dimensions, hoveredNodeId, showLabels]);

  // Coordinate math
  const screenToWorld = useCallback((x: number, y: number) => {
    const t = transformRef.current;
    return {
      x: (x - t.x) / t.k,
      y: (y - t.y) / t.k
    };
  }, []);

  // Events
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    lastPointerRef.current = { x: clientX, y: clientY };
    
    const worldPos = screenToWorld(clientX, clientY);
    
    const { nodes } = dataRef.current;
    const transform = transformRef.current;
    let clickedNode: PositionedNode | null = null;
    let minDistance = 20 / transform.k; // 20px hit radius, scaled

    for (const node of nodes) {
      if (node.x == null || node.y == null) continue;
      const dx = node.x - worldPos.x;
      const dy = node.y - worldPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistance) {
        minDistance = dist;
        clickedNode = node;
      }
    }

    isDraggingRef.current = true;
    
    if (clickedNode) {
      // Dragging a specific node
      draggedNodeRef.current = clickedNode;
      clickedNode.fx = clickedNode.x;
      clickedNode.fy = clickedNode.y;
      if (simulationRef.current) simulationRef.current.alphaTarget(0.1).restart();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const dx = clientX - lastPointerRef.current.x;
    const dy = clientY - lastPointerRef.current.y;

    if (isDraggingRef.current) {
      if (draggedNodeRef.current) {
        // Dragging the node
        const worldPos = screenToWorld(clientX, clientY);
        draggedNodeRef.current.fx = worldPos.x;
        draggedNodeRef.current.fy = worldPos.y;
      } else {
        // Panning the canvas
        transformRef.current.x += dx;
        transformRef.current.y += dy;
      }
      lastPointerRef.current = { x: clientX, y: clientY };
    } else {
      // Hover Detection
      const worldPos = screenToWorld(clientX, clientY);
      const { nodes } = dataRef.current;
      const transform = transformRef.current;
      let closestId: string | null = null;
      let minDistance = 20 / transform.k;

      for (const node of nodes) {
        if (node.x == null || node.y == null) continue;
        const ndx = node.x - worldPos.x;
        const ndy = node.y - worldPos.y;
        const dist = Math.sqrt(ndx * ndx + ndy * ndy);
        if (dist < minDistance) {
          minDistance = dist;
          closestId = node.id;
        }
      }
      
      if (closestId !== hoveredNodeId) {
        setHoveredNodeId(closestId);
        // Interactive bounce/nudge on hover
        if (closestId && simulationRef.current) {
           const active = nodes.find(n => n.id === closestId);
           if (active && !active.fx && active.vx != null && active.vy != null) {
             active.vx += (Math.random() - 0.5) * 8;
             active.vy += (Math.random() - 0.5) * 8;
             simulationRef.current.alpha(0.05).restart();
           }
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDraggingRef.current = false;
    
    if (draggedNodeRef.current) {
      draggedNodeRef.current.fx = null;
      draggedNodeRef.current.fy = null;
      draggedNodeRef.current = null;
      if (simulationRef.current) simulationRef.current.alphaTarget(0.02);
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const dx = clientX - pointerDownMetaRef.current.x;
      const dy = clientY - pointerDownMetaRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const time = Date.now() - pointerDownMetaRef.current.time;

      if (dist < 5 && time < 300) {
        const worldPos = screenToWorld(clientX, clientY);
        const { nodes } = dataRef.current;
        const transform = transformRef.current;
        let clickedNodeId: string | null = null;
        let minDistance = 20 / transform.k;

        for (const node of nodes) {
          if (node.x == null || node.y == null) continue;
          const ndx = node.x - worldPos.x;
          const ndy = node.y - worldPos.y;
          const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
          if (ndist < minDistance) {
            minDistance = ndist;
            clickedNodeId = node.id;
          }
        }
        if (clickedNodeId && onNodeClick) {
          onNodeClick(clickedNodeId);
        }
      }
    }
  };

  const activeNode = hoveredNodeId ? dataRef.current.nodes.find(n => n.id === hoveredNodeId) : null;

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-[#f5f5f4] rounded-2xl border border-[#d6d3d1] shadow-inner"
    >
      <div className="absolute top-5 left-5 z-20 pointer-events-none">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse shadow-[0_0_8px_var(--color-accent)]"></span>
            <span className="text-[10px] font-headline uppercase tracking-[0.2em] text-primary font-bold">Intelligence Matrix</span>
          </div>
          <p className="text-[9px] text-secondary font-headline uppercase tracking-widest">Interactive Sandbox</p>
          <p className="text-[9px] text-secondary font-headline uppercase tracking-widest bg-white/50 inline-block px-1.5 py-0.5 rounded-sm w-fit mt-1 border border-[#e7e5e4]">
            Scroll = Zoom • Drag = Pan / Move Node
          </p>
        </div>
      </div>

      <div className="absolute top-5 right-5 z-20 flex flex-col items-end gap-2 pointer-events-auto">
        <button
          onClick={() => setShowLabels(!showLabels)}
          className="px-3 py-1.5 bg-white/90 border border-[#d6d3d1] rounded-md shadow-sm backdrop-blur-md text-[9px] font-headline uppercase tracking-wider text-secondary hover:text-primary hover:border-primary transition-colors flex items-center gap-2"
        >
          <span className={`w-2 h-2 rounded-full ${showLabels ? 'bg-accent' : 'bg-[#d6d3d1]'}`}></span>
          {showLabels ? 'Hide Labels' : 'Show Labels'}
        </button>
        <div className="px-3 py-1.5 bg-white/90 border border-[#d6d3d1] rounded-md shadow-sm backdrop-blur-md pointer-events-none">
          <span className="text-[9px] font-headline uppercase tracking-wider text-primary font-bold">
            {activeNode ? `Focus: ${activeNode.label.slice(0, 20)}...` : "Global Trajectory"}
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="block cursor-grab active:cursor-grabbing touch-none"
      />
    </div>
  );
}

// Generate aesthetic pastel/vibrant colors suited for light themes
function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const s = 65 + (Math.abs(hash >> 8) % 20); // 65-85% saturation
  const l = 50 + (Math.abs(hash >> 16) % 15); // 50-65% lightness
  return `hsl(${h}, ${s}%, ${l}%)`;
}
