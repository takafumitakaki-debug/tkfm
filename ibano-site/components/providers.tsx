"use client";

import { MotionConfig } from "framer-motion";

// OS の「視差効果を減らす」設定を Framer Motion 全体に反映
export function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
