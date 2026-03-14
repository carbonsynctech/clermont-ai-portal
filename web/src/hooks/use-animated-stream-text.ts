"use client";

import { useEffect, useState } from "react";

const TICK_MS = 16;

export function useAnimatedStreamText(targetText: string, isStreaming: boolean): string {
  const [animatedText, setAnimatedText] = useState(targetText);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    const timer = window.setInterval(() => {
      setAnimatedText((current) => {
        if (targetText.length < current.length) {
          return targetText;
        }

        if (targetText.length <= current.length) {
          return current;
        }

        const remaining = targetText.length - current.length;
        const step = Math.max(1, Math.min(6, Math.ceil(remaining / 24)));
        return targetText.slice(0, current.length + step);
      });
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [isStreaming, targetText]);

  return isStreaming ? animatedText : targetText;
}
