"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

export function LottieLoader({ autoHide = true }: { autoHide?: boolean }) {
  const [isHidden, setIsHidden] = useState(false);
  const minShowMs = 700;

  useEffect(() => {
    if (!autoHide) return;

    const handleLoad = () => {
      window.setTimeout(() => setIsHidden(true), minShowMs);
    };

    if (document.readyState === "complete") {
      handleLoad();
    } else {
      window.addEventListener("load", handleLoad);
    }

    return () => {
      window.removeEventListener("load", handleLoad);
    };
  }, [autoHide]);

  return (
    <>
      <Script
        src="https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs"
        type="module"
        strategy="afterInteractive"
      />
      <div className={`lottie-loader-overlay${isHidden ? " lottie-loader-hidden" : ""}`} aria-hidden="true">
        <div className="lottie-loader-card">
          <dotlottie-player
            src="/davsan.lottie"
            background="transparent"
            speed="1"
            loop
            autoplay
            style={{ width: "220px", height: "220px" }}
          ></dotlottie-player>
        </div>
      </div>
    </>
  );
}
