"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export function RabbitLoaderScene() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) {
      return;
    }

    const ctx = gsap.context(() => {
      gsap.to(".rb-body", {
        y: -4,
        duration: 0.38,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      gsap.to(".rb-shadow", {
        scaleX: 0.88,
        opacity: 0.2,
        duration: 0.38,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      gsap.to(".rb-ear-a", {
        rotation: -10,
        transformOrigin: "50% 90%",
        duration: 0.36,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      gsap.to(".rb-ear-b", {
        rotation: 8,
        transformOrigin: "50% 90%",
        duration: 0.36,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      gsap.to(".rb-tail", {
        scale: 0.94,
        x: -1,
        duration: 0.34,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      const legPairs = [
        [".rb-leg-f1", ".rb-leg-b1"],
        [".rb-leg-f2", ".rb-leg-b2"],
      ] as const;

      legPairs.forEach(([front, back], index) => {
        const delay = index * 0.16;
        gsap.to(front, {
          rotation: -24,
          transformOrigin: "50% 0%",
          duration: 0.28,
          repeat: -1,
          yoyo: true,
          ease: "power1.inOut",
          delay,
        });
        gsap.to(back, {
          rotation: 20,
          transformOrigin: "50% 0%",
          duration: 0.28,
          repeat: -1,
          yoyo: true,
          ease: "power1.inOut",
          delay,
        });
      });

      gsap.to(".rb-ground-track", {
        backgroundPositionX: -54,
        duration: 0.74,
        repeat: -1,
        ease: "none",
      });

      gsap.to(".rb-trail", {
        opacity: 0.08,
        x: -5,
        duration: 0.42,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      gsap.to(".rb-dot", {
        y: -1.5,
        opacity: 0.9,
        duration: 0.32,
        repeat: -1,
        yoyo: true,
        stagger: 0.08,
        ease: "sine.inOut",
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className="rabbit-loader-shell rabbit-loader-rich rabbit-loader-mini"
    >
      <svg
        className="rabbit-loader-wrap"
        viewBox="0 0 260 170"
        aria-hidden="true"
      >
        <g className="rb-trail" opacity="0.14">
          <ellipse cx="108" cy="94" rx="44" ry="28" fill="#d0d3d8" />
        </g>

        <g className="rb-body">
          <g className="rb-leg-f1" transform="translate(132 103)">
            <rect
              x="-3.6"
              y="0"
              width="7.2"
              height="27"
              rx="4"
              fill="#20252f"
            />
            <ellipse cx="0" cy="28" rx="6" ry="3.4" fill="#5a6270" />
          </g>
          <g className="rb-leg-f2" transform="translate(150 100)">
            <rect
              x="-3.6"
              y="0"
              width="7.2"
              height="27"
              rx="4"
              fill="#20252f"
            />
            <ellipse cx="0" cy="28" rx="6" ry="3.4" fill="#5a6270" />
          </g>
          <g className="rb-leg-b1" transform="translate(88 103)">
            <rect
              x="-3.8"
              y="0"
              width="7.6"
              height="28"
              rx="4"
              fill="#20252f"
            />
            <ellipse cx="0" cy="29" rx="6.2" ry="3.5" fill="#5a6270" />
          </g>
          <g className="rb-leg-b2" transform="translate(104 101)">
            <rect
              x="-3.8"
              y="0"
              width="7.6"
              height="28"
              rx="4"
              fill="#20252f"
            />
            <ellipse cx="0" cy="29" rx="6.2" ry="3.5" fill="#5a6270" />
          </g>

          <ellipse cx="108" cy="90" rx="44" ry="26" fill="#20252f" />
          <ellipse
            cx="97"
            cy="89"
            rx="16"
            ry="10"
            fill="#5a6270"
            opacity="0.35"
          />

          <g className="rb-tail" transform="translate(64 88)">
            <circle cx="0" cy="0" r="8" fill="#20252f" />
          </g>

          <circle cx="154" cy="78" r="18" fill="#20252f" />
          <ellipse
            cx="160"
            cy="84"
            rx="5"
            ry="3.4"
            fill="#5a6270"
            opacity="0.9"
          />
          <circle cx="159" cy="74" r="2.1" fill="#0d1117" />

          <g className="rb-ear-a">
            <ellipse cx="146" cy="50" rx="5.2" ry="18" fill="#20252f" />
            <ellipse
              cx="146"
              cy="52"
              rx="2.1"
              ry="11"
              fill="#636f80"
              opacity="0.75"
            />
          </g>
          <g className="rb-ear-b">
            <ellipse cx="162" cy="49" rx="4.8" ry="16" fill="#20252f" />
            <ellipse
              cx="162"
              cy="51"
              rx="1.9"
              ry="10"
              fill="#636f80"
              opacity="0.72"
            />
          </g>
        </g>
      </svg>

      <div className="rb-shadow rabbit-shadow" />
      <div className="rabbit-ground rb-ground-track" />
      <div className="rabbit-dots" aria-hidden="true">
        Loading <i className="rb-dot" /> <i className="rb-dot" />{" "}
        <i className="rb-dot" />
      </div>
    </div>
  );
}
