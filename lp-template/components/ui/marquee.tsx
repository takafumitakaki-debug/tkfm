"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// 21st.dev の「Marquee」型：横に流れ続ける帯（2セット並べて -50% まで動かし、継ぎ目なくループ）
export function Marquee({ items, className, duration = 40 }: { items: string[]; className?: string; duration?: number }) {
  return (
    <div className={cn("overflow-hidden", className)} aria-hidden>
      <motion.div
        className="flex w-max gap-12 pr-12"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        {[...items, ...items].map((t, i) => (
          <span key={i} className="whitespace-nowrap">
            {t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
