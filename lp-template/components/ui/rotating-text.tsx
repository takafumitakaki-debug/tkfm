"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

// 単語が下から入れ替わる見出し（21st.dev の Animated Hero 型）
export function RotatingText({ words, interval = 2600 }: { words: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);

  return (
    <motion.span layout transition={{ duration: 0.3 }} className="relative inline-flex h-[1.35em] overflow-hidden align-bottom">
      {/* 今の単語の幅だけ確保し、幅の変化はなめらかに伸び縮みさせる */}
      <span className="invisible whitespace-nowrap">{words[index]}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={words[index]}
          className="absolute left-0 whitespace-nowrap text-primary"
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 70, damping: 16 }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}
