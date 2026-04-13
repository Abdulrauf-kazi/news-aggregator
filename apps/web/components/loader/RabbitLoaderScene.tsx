"use client";

import { motion } from "framer-motion";

export function RabbitLoaderScene() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative w-24 h-24 flex items-center justify-center">
        {/* Bouncy Shadow */}
        <motion.div
          animate={{
            scaleX: [1, 1.2, 1],
            opacity: [0.2, 0.1, 0.2],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute bottom-2 w-12 h-2 bg-primary/20 rounded-full blur-sm"
        />

        {/* The Cute Rabbit */}
        <motion.div
          animate={{
            y: [0, -20, 0],
            rotate: [0, -5, 5, 0],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="relative z-10 w-16 h-16"
        >
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
            {/* Ears */}
            <motion.path
              d="M30,30 Q20,0 40,15 Q35,30 30,30"
              fill="#022448"
              animate={{ rotate: [-10, 10, -10] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "30px 30px" }}
            />
            <motion.path
              d="M50,25 Q60,-5 70,20 Q60,35 50,25"
              fill="#022448"
              animate={{ rotate: [10, -10, 10] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "50px 25px" }}
            />
            
            {/* Body */}
            <circle cx="50" cy="60" r="30" fill="#022448" />
            
            {/* Eyes */}
            <motion.circle 
              cx="40" cy="55" r="3" fill="white" 
              animate={{ scaleY: [1, 0.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, times: [0, 0.1, 0.2] }}
            />
            <motion.circle 
              cx="60" cy="55" r="3" fill="white" 
              animate={{ scaleY: [1, 0.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, times: [0, 0.1, 0.2] }}
            />
            
            {/* Nose */}
            <path d="M48,65 L52,65 L50,68 Z" fill="#FF6B6B" />
            
            {/* Cheeks */}
            <circle cx="35" cy="65" r="4" fill="#FF6B6B" opacity="0.3" />
            <circle cx="65" cy="65" r="4" fill="#FF6B6B" opacity="0.3" />
          </svg>
        </motion.div>
      </div>

      <div className="flex flex-col items-center">
        <p className="font-headline text-[10px] uppercase tracking-[0.2em] text-primary font-bold">
          Gathering Intel
        </p>
        <div className="flex gap-1 mt-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
              }}
              className="w-1 h-1 bg-accent rounded-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
