"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";

const INTELLIGENCE_BRIEFS = [
  "Synchronizing with London and Paris intelligence nodes...",
  "Correlating 14,000+ global signals for semantic overlap...",
  "Decrypting high-fidelity satellite telemetry...",
  "Parsing macroeconomic clusters across 42 markets...",
  "Filtering noise from premium geopolitical feeds...",
  "Initializing neural pathway recommendations...",
  "Aggregating real-time financial volatility pulses...",
  "Calibrating cross-source consensus engines...",
  "Optimizing topology for relationship mapping...",
  "Establishing secure handshake with global RSS uplinks..."
];

export function RabbitLoaderScene({ isExiting = false }: { isExiting?: boolean }) {
  const [briefIndex, setBriefIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);
  const rabbitRef = useRef<HTMLDivElement>(null);
  const matrixRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    
    // Progress increment logic
    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 99) return 99;
        const inc = Math.random() > 0.8 ? 0.2 : 0.8;
        return Number((prev + inc).toFixed(1));
      });
    }, 150);

    // Brief rotation logic
    const briefTimer = setInterval(() => {
      setBriefIndex((prev) => (prev + 1) % INTELLIGENCE_BRIEFS.length);
    }, 3000);

    // GSAP Animation for the rabbit body (gentle hover/vibration)
    if (rabbitRef.current) {
      gsap.to(rabbitRef.current, {
        y: "-=4",
        x: "+=2",
        rotation: 2,
        duration: 0.1,
        repeat: -1,
        yoyo: true,
        ease: "none",
      });
    }

    return () => {
      clearInterval(progressTimer);
      clearInterval(briefTimer);
      gsap.killTweensOf(rabbitRef.current);
    };
  }, []);

  // Set progress to 100 when exiting
  useEffect(() => {
    if (isExiting) {
      setProgress(100);
    }
  }, [isExiting]);

  // Matrix items generation
  const matrixItems = useMemo(() => {
    if (!mounted) return [];
    return [...Array(12)].map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      duration: 3 + Math.random() * 4,
      delay: Math.random() * 5,
      text: Math.random().toString(16).substring(2, 8).toUpperCase()
    }));
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="flex flex-col items-center justify-center gap-12 scale-110 select-none">
        <div className="relative w-72 h-48 flex items-center justify-center">
          <div className="w-28 h-28 bg-neutral-200/20 rounded-full animate-pulse" />
        </div>
        <div className="w-48 h-1 bg-neutral-200 rounded-full" />
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ 
        opacity: isExiting ? 0 : 1, 
        scale: isExiting ? 1.1 : 1.1,
        y: isExiting ? -20 : 0,
        filter: isExiting ? "blur(20px)" : "blur(0px)"
      }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center gap-12 select-none"
    >
      {/* Background Matrix Effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20" ref={matrixRef}>
        {matrixItems.map((item) => (
          <div
            key={`matrix-${item.id}`}
            style={{
              left: item.left,
              animationName: "matrix-fall",
              animationDuration: `${item.duration}s`,
              animationTimingFunction: "linear",
              animationIterationCount: "infinite",
              animationDelay: `${item.delay}s`,
              position: "absolute",
              top: -20,
            }}
            className="text-[8px] font-mono text-accent leading-none whitespace-pre"
          >
            {item.text}
          </div>
        ))}
      </div>

      <div className="relative w-72 h-48 flex flex-col items-center justify-center">
        {/* Radar Ping Effect */}
        <div 
          style={{ 
            animationName: "radar-ping",
            animationDuration: "2s",
            animationTimingFunction: "ease-out",
            animationIterationCount: "infinite"
          }}
          className="absolute w-32 h-32 border-2 border-accent/20 rounded-full"
        />
        
        {/* Speed Lines */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div
              key={`line-${i}`}
              style={{ 
                top: `${15 + i * 15}%`,
                width: `${80 + Math.random() * 100}px`,
                animationName: "speed-line-anim",
                animationDuration: `${0.3 + Math.random() * 0.2}s`,
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
                animationDelay: `${i * 0.05}s`
              }}
              className="absolute h-[1px] bg-gradient-to-r from-transparent via-accent to-transparent"
            />
          ))}
        </div>

        {/* The Rocket Rabbit */}
        <div ref={rabbitRef} className="relative z-10 w-28 h-28">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,62,0,0.3)]">
            {/* Afterburner Glow */}
            <circle 
              cx="10" cy="65" r="15" 
              fill="url(#fireGradient)"
              style={{ 
                animationName: "flame-flicker",
                animationDuration: "0.1s",
                animationTimingFunction: "ease-in-out",
                animationIterationCount: "infinite",
                transformOrigin: "10px 65px" 
              }}
            />
            <defs>
              <radialGradient id="fireGradient">
                <stop offset="0%" stopColor="#ff3e00" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
            </defs>

            {/* Ears */}
            <path
              d="M30,30 Q5,5 35,20 Q30,30 30,30"
              fill="#0a0a0a"
              style={{ 
                animationName: "rabbit-ear-flap",
                animationDuration: "0.08s",
                animationTimingFunction: "ease-in-out",
                animationIterationCount: "infinite",
                transformOrigin: "30px 30px" 
              }}
            />
            <path
              d="M50,25 Q20,0 55,15 Q50,25 50,25"
              fill="#0a0a0a"
              style={{ 
                animationName: "rabbit-ear-flap",
                animationDuration: "0.08s",
                animationTimingFunction: "ease-in-out",
                animationIterationCount: "infinite",
                animationDelay: "0.04s", 
                transformOrigin: "50px 25px" 
              }}
            />
            
            {/* Body */}
            <ellipse cx="50" cy="65" rx="40" ry="24" fill="#0a0a0a" />
            
            {/* Legs - Static but vibrating with body */}
            <path d="M70,80 Q85,95 95,85" stroke="#0a0a0a" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M30,80 Q15,95 5,85" stroke="#0a0a0a" strokeWidth="8" strokeLinecap="round" fill="none" />

            {/* Tail */}
            <circle cx="10" cy="65" r="8" fill="#0a0a0a" />

            {/* Glowing Eyes */}
            <circle cx="75" cy="60" r="3" fill="white" />
            <circle cx="88" cy="60" r="3" fill="white" />
            <circle cx="75" cy="60" r="1.5" fill="#ff3e00" />
          </svg>
        </div>

        {/* Ground Scroll */}
        <div className="absolute bottom-0 w-full h-1 bg-primary/10 rounded-full overflow-hidden">
          <div 
            style={{ 
              animationName: "ground-scroll",
              animationDuration: "0.2s",
              animationTimingFunction: "linear",
              animationIterationCount: "infinite",
              backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 15px, var(--color-accent) 15px, var(--color-accent) 30px)"
            }}
            className="w-[200%] h-full opacity-30"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-4xl font-black text-primary tracking-tighter tabular-nums">
              {progress.toFixed(0)}
            </span>
            <span className="font-headline text-xs font-bold text-secondary uppercase tracking-widest">
              % Signal Sync
            </span>
          </div>
          <div className="w-48 h-1 bg-neutral-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="h-12 flex items-center justify-center px-6">
          <AnimatePresence mode="wait">
            <motion.p
              key={briefIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="font-headline text-[10px] uppercase tracking-[0.25em] text-secondary font-bold leading-relaxed"
            >
              {isExiting ? "INITIALIZATION COMPLETE. READY." : INTELLIGENCE_BRIEFS[briefIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
