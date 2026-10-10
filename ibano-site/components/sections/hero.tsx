"use client";

import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RotatingText } from "@/components/ui/rotating-text";

// FV：現場写真3〜4枚のゆっくりしたクロスフェード（docs/02 S00）
const scenes = [
  { note: "早朝、倉庫から配送トラックが出ていく", from: "#3a2620", to: "#7f1515" },
  { note: "ホテル厨房の勝手口で、納品を受け渡す社員の手元", from: "#2a1a14", to: "#a16207" },
  { note: "店舗でお客様に肉の部位を説明するスタッフ", from: "#4a1d18", to: "#9f1d1d" },
  { note: "厨房で料理として使われる瞬間", from: "#1c1210", to: "#6b3a1f" },
];

export function Hero() {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "25%"]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % scenes.length), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <section id="top" ref={ref} className="relative flex min-h-[100svh] flex-col overflow-hidden bg-night text-white">
      <motion.div className="absolute inset-0" style={{ y }}>
        <AnimatePresence>
          <motion.div
            key={i}
            role="img"
            aria-label={`写真（仮）：${scenes[i].note}`}
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${scenes[i].from}, ${scenes[i].to})` }}
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 1.6 }, scale: { duration: 6, ease: "linear" } }}
          />
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-night via-night/40 to-transparent" />
      </motion.div>

      <motion.div style={{ opacity: fade }} className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-4 pb-28 pt-32 md:px-8">
        <motion.p
          className="mb-6 text-sm tracking-[0.3em] text-white/70"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          沖縄の食を支える。
        </motion.p>
        <motion.h1
          className="font-serif text-4xl font-bold leading-[1.4] md:text-6xl"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          1963年から、
          <br />
          沖縄の<RotatingText words={["厨房", "食卓", "ホテル", "居酒屋"]} />に
          <br />
          食材を届けています。
        </motion.h1>
        <motion.p
          className="mt-6 max-w-xl text-sm text-white/75 md:text-base"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
        >
          株式会社イバノ／業務用食材の卸・輸入・店舗・自社商品開発
        </motion.p>
        <motion.a
          href="#about"
          className="mt-12 inline-flex w-fit items-center gap-3 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          01 理念から読む
          <motion.span animate={{ y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>
            <ArrowDown className="size-4" aria-hidden />
          </motion.span>
        </motion.a>
        <p className="absolute bottom-28 right-4 font-serif text-xs tracking-[0.4em] text-white/60 md:right-8">SINCE 1963</p>
        <p className="absolute right-4 top-24 max-w-[14rem] text-right text-[11px] text-white/50 md:right-8">
          PHOTO（仮）：{scenes[i].note}
        </p>
      </motion.div>

      {/* 最新ニュース1件（更新感の担保） */}
      <a href="#news" className="relative border-t border-white/15 bg-black/30 py-4 text-sm backdrop-blur">
        <span className="mx-auto flex max-w-6xl items-center gap-4 px-4 md:px-8">
        <span className="shrink-0 text-xs tracking-widest text-accent-soft">NEWS</span>
        <span className="shrink-0 text-white/60">2026.10.01</span>
        <span className="truncate">【ニュースタイトルを配置】</span>
        </span>
      </a>
    </section>
  );
}
