"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

// 21st.dev の「Animated Hero」型：単語が下から入れ替わる見出し
export function RotatingText({ words, interval = 2600 }: { words: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);

  return (
    <span className="relative inline-flex h-[1.3em] overflow-hidden align-bottom">
      {/* 幅を一番長い単語に合わせて確保し、入れ替わりでレイアウトが揺れないようにする */}
      <span className="invisible">{words.reduce((a, b) => (b.length > a.length ? b : a))}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={words[index]}
          className="absolute inset-x-0 text-accent-soft"
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 70, damping: 16 }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {words[index]}
      </span>
    </span>
  );
}
