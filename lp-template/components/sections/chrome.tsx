"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import type { SiteConfig } from "@/content/types";
import { CtaLink } from "@/components/ui/cta-link";
import { cn } from "@/lib/utils";

export function Header({ site }: { site: SiteConfig }) {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 20));

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        solid || open ? "bg-bg/90 shadow-[0_1px_0_var(--color-line)] backdrop-blur" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <a href="/" className="font-heading text-lg font-bold">
          {site.brand.logoText}
        </a>
        <nav aria-label="メイン" className="hidden items-center gap-7 text-sm md:flex">
          {site.nav.map((n) => (
            <a key={n.href} href={n.href} className="py-2 text-muted transition-colors hover:text-ink">
              {n.label}
            </a>
          ))}
          <CtaLink cta={site.headerCta} className="min-h-10 px-5 py-2" />
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
      <AnimatePresence>
        {open && (
          <motion.nav
            aria-label="メイン（スマートフォン）"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-line px-4 md:hidden"
          >
            {site.nav.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block border-b border-line py-4">
                {n.label}
              </a>
            ))}
            <div className="py-5" onClick={() => setOpen(false)}>
              <CtaLink cta={site.headerCta} className="w-full" />
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
      <motion.div className="h-0.5 origin-left bg-primary" style={{ scaleX: progress }} />
    </header>
  );
}

// スマホで少しスクロールしたら画面下に出る申込ボタン
export function StickyCta({ site }: { site: SiteConfig }) {
  const { scrollY } = useScroll();
  const [show, setShow] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setShow(y > 600));
  if (!site.stickyCta) return null;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
        >
          <CtaLink cta={site.stickyCta} className="w-full" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Footer({ site }: { site: SiteConfig }) {
  return (
    <footer className="bg-dark px-4 pb-28 pt-12 text-sm text-white/60 md:px-8 md:pb-12">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="font-heading text-lg font-bold text-white">{site.brand.name}</p>
          {site.brand.tagline && <p className="mt-1">{site.brand.tagline}</p>}
        </div>
        <nav aria-label="フッター" className="flex flex-wrap gap-x-6 gap-y-2">
          <a href="/legal/" className="py-1 hover:text-white">特定商取引法に基づく表記</a>
          <a href="/privacy/" className="py-1 hover:text-white">プライバシーポリシー</a>
          <a href={`mailto:${site.contact.email}`} className="py-1 hover:text-white">{site.contact.email}</a>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-xs">© {site.brand.name}</p>
    </footer>
  );
}
