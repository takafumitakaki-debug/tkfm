"use client";

import { motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "#about", label: "理念" },
  { href: "#philosophy", label: "フィロソフィ" },
  { href: "#business", label: "事業" },
  { href: "#people", label: "人" },
  { href: "#area", label: "地域" },
  { href: "#recruit", label: "採用" },
];

export function Header() {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 40));

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        solid || open ? "bg-bg/90 text-ink shadow-[0_1px_0_var(--color-line)] backdrop-blur" : "text-white",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <a href="#top" className="font-serif text-lg font-bold tracking-widest">
          IVANO<span className="ml-2 text-xs font-normal tracking-normal opacity-80">株式会社イバノ</span>
        </a>
        <nav aria-label="メイン" className="hidden items-center gap-6 text-sm md:flex">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="py-2 opacity-90 transition-opacity hover:opacity-100">
              {n.label}
            </a>
          ))}
          <a
            href="#contact"
            className="rounded-full bg-primary px-5 py-2.5 text-white transition-colors hover:bg-primary-strong"
          >
            お問い合わせ
          </a>
        </nav>
        <button
          type="button"
          className="grid size-11 place-items-center md:hidden"
          aria-label={open ? "メニューを閉じる" : "メニューを開く"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
        </button>
      </div>
      {open && (
        <motion.nav
          aria-label="メイン（スマートフォン）"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-line px-4 pb-6 md:hidden"
        >
          {[...nav, { href: "#contact", label: "お問い合わせ" }].map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block border-b border-line py-4">
              {n.label}
            </a>
          ))}
        </motion.nav>
      )}
      {/* 読了の進み具合 */}
      <motion.div className="h-0.5 origin-left bg-accent" style={{ scaleX: progress }} />
    </header>
  );
}
