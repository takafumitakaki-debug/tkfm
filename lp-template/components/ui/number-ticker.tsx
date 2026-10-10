"use client";

import { animate, useInView, useMotionValue, useTransform, motion } from "framer-motion";
import { useEffect, useRef } from "react";

// 21st.dev / Magic UI の「Number Ticker」型：画面に入ったら数字をカウントアップ
export function NumberTicker({ value, duration = 1.6, grouping = true }: { value: number; duration?: number; grouping?: boolean }) {
  const fmt = (v: number) => v.toLocaleString("ja-JP", { useGrouping: grouping });
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => fmt(Math.round(v)));

  useEffect(() => {
    if (!inView) return;
    const controls = animate(count, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [inView, count, value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      <motion.span aria-hidden>{rounded}</motion.span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  );
}
