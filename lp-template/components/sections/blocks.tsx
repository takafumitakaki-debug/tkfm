"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Quote, X } from "lucide-react";
import { Fragment, useState } from "react";
import type { Section } from "@/content/types";
import { CtaLink } from "@/components/ui/cta-link";
import { Icon } from "@/components/ui/icon";
import { Img } from "@/components/ui/img";
import { Marquee } from "@/components/ui/marquee";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { RotatingText } from "@/components/ui/rotating-text";
import { cn } from "@/lib/utils";

type Of<T extends Section["type"]> = Extract<Section, { type: T }>;

const wrap = "mx-auto max-w-6xl px-4 md:px-8";

// 「1行目\n2行目」の改行と、{rotate} の入れ替わる単語を描画する
function RichTitle({ text, words }: { text: string; words?: string[] }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split("{rotate}").map((part, j) => (
            <Fragment key={j}>
              {j > 0 && (words?.length ? <RotatingText words={words} /> : null)}
              {part}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );
}

function Heading({ label, title, lead, center = true }: { label?: string; title: string; lead?: string; center?: boolean }) {
  return (
    <Reveal className={cn("mb-12 md:mb-16", center && "text-center")}>
      {label && (
        <RevealItem as="p" className="text-xs font-bold tracking-[0.3em] text-accent">
          {label}
        </RevealItem>
      )}
      <RevealItem as="h2" className="mt-3 font-heading text-3xl font-bold leading-snug md:text-4xl">
        <RichTitle text={title} />
      </RevealItem>
      {lead && (
        <RevealItem as="p" className={cn("mt-4 text-muted", center && "mx-auto max-w-2xl")}>
          {lead}
        </RevealItem>
      )}
    </Reveal>
  );
}

export function Hero(s: Of<"hero">) {
  return (
    <section id="top" className="relative overflow-hidden pb-20 pt-32 md:pb-28 md:pt-40">
      {/* 背景のゆっくり動く光 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full bg-primary/15 blur-3xl"
        animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-40 size-[28rem] rounded-full bg-accent/10 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className={cn(wrap, "relative grid items-center gap-12", s.image && "md:grid-cols-[1.1fr_1fr]")}>
        <div>
          {s.eyebrow && (
            <motion.p
              className="text-sm font-bold text-accent"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {s.eyebrow}
            </motion.p>
          )}
          <motion.h1
            className={cn(
              "mt-4 font-heading text-[2rem] font-bold leading-[1.4] sm:text-5xl",
              s.image ? "md:text-4xl lg:text-5xl" : "lg:text-6xl",
            )}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <RichTitle text={s.title} words={s.rotatingWords} />
          </motion.h1>
          <motion.p
            className="mt-6 max-w-xl text-muted md:text-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.35 }}
          >
            {s.lead}
          </motion.p>
          <motion.div
            className="mt-8 flex flex-col gap-3 sm:flex-row"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <CtaLink cta={s.primaryCta} />
            {s.secondaryCta && <CtaLink cta={s.secondaryCta} variant="outline" />}
          </motion.div>
          {s.badges && (
            <motion.ul
              className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              {s.badges.map((b) => (
                <li key={b} className="flex items-center gap-1.5">
                  <Check className="size-4 text-primary" aria-hidden />
                  {b}
                </li>
              ))}
            </motion.ul>
          )}
        </div>
        {s.image && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }}>
            <Img image={s.image} className="aspect-[4/3] w-full" />
          </motion.div>
        )}
      </div>
    </section>
  );
}

export function Logos(s: Of<"logos">) {
  return (
    <section className="border-y border-line bg-surface py-8">
      {s.title && <p className="mb-5 text-center text-xs text-muted">{s.title}</p>}
      <Marquee items={s.items} className="text-lg font-bold tracking-[0.3em] text-muted/70" duration={30} />
    </section>
  );
}

export function Problems(s: Of<"problems">) {
  return (
    <section id={s.id} className="scroll-mt-20 py-24">
      <div className={cn(wrap, "max-w-4xl")}>
        <Heading title={s.title} />
        <Reveal as="ul" className="grid gap-4 sm:grid-cols-2">
          {s.items.map((p) => (
            <RevealItem as="li" key={p} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-5">
              <X className="mt-1 size-5 shrink-0 text-accent" aria-hidden />
              <span>{p}</span>
            </RevealItem>
          ))}
        </Reveal>
        <Reveal className="mt-12 text-center">
          <RevealItem>
            <ChevronDown className="mx-auto size-8 text-primary" aria-hidden />
          </RevealItem>
          <RevealItem as="p" className="mt-4 font-heading text-xl font-bold leading-relaxed md:text-2xl">
            {s.answer}
          </RevealItem>
        </Reveal>
      </div>
    </section>
  );
}

export function Features(s: Of<"features">) {
  return (
    <section id={s.id} className="scroll-mt-20 bg-surface py-24">
      <div className={wrap}>
        <Heading label={s.label} title={s.title} lead={s.lead} />
        <Reveal className="grid gap-6 md:grid-cols-3">
          {s.items.map((f, i) => (
            <RevealItem key={f.title}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="h-full rounded-2xl border border-line bg-bg p-7"
              >
                {f.image ? (
                  <Img image={f.image} className="mb-6 aspect-[4/3] w-full" />
                ) : (
                  <div className="mb-6 grid size-12 place-items-center rounded-xl bg-primary text-white">
                    <Icon name={f.icon} className="size-6" />
                  </div>
                )}
                <p className="text-xs font-bold text-accent">0{i + 1}</p>
                <h3 className="mt-1 font-heading text-xl font-bold">{f.title}</h3>
                <p className="mt-3 text-sm text-muted">{f.body}</p>
              </motion.div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function Stats(s: Of<"stats">) {
  return (
    <section className="bg-dark py-16 text-white">
      <Reveal className={cn(wrap, "grid gap-10 text-center sm:grid-cols-3")}>
        {s.items.map((n) => (
          <RevealItem key={n.label}>
            <p className="text-sm text-white/70">{n.label}</p>
            <p className="mt-2 font-heading text-5xl font-bold">
              <NumberTicker value={n.value} grouping={!n.noGrouping} />
              {n.unit && <span className="ml-1 text-lg">{n.unit}</span>}
            </p>
            {n.note && <p className="mt-1 text-xs text-white/50">{n.note}</p>}
          </RevealItem>
        ))}
      </Reveal>
    </section>
  );
}

export function Testimonials(s: Of<"testimonials">) {
  return (
    <section id={s.id} className="scroll-mt-20 py-24">
      <div className={wrap}>
        <Heading label={s.label} title={s.title} />
        <Reveal className="grid gap-6 md:grid-cols-3">
          {s.items.map((t) => (
            <RevealItem key={t.name + t.quote} className="flex flex-col rounded-2xl border border-line bg-surface p-7">
              <Quote className="size-6 text-primary/40" aria-hidden />
              <p className="mt-4 flex-1 leading-relaxed">{t.quote}</p>
              <div className="mt-6 flex items-center gap-3">
                <Img image={t.image ?? { alt: t.name }} className="size-11 shrink-0 rounded-full [&>span]:hidden" />
                <div className="text-sm">
                  <p className="font-bold">{t.name}</p>
                  {t.role && <p className="text-muted">{t.role}</p>}
                </div>
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function Pricing(s: Of<"pricing">) {
  return (
    <section id={s.id} className="scroll-mt-20 bg-surface py-24">
      <div className={wrap}>
        <Heading label={s.label} title={s.title} lead={s.lead} />
        <Reveal className={cn("grid items-stretch gap-6", s.plans.length >= 3 ? "md:grid-cols-3" : "mx-auto max-w-3xl md:grid-cols-2")}>
          {s.plans.map((p) => (
            <RevealItem
              key={p.name}
              className={cn(
                "relative flex flex-col rounded-3xl border p-8",
                p.highlight ? "border-primary bg-bg shadow-xl shadow-primary/10 md:-my-4 md:py-12" : "border-line bg-bg",
              )}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-bold text-white">
                  おすすめ
                </span>
              )}
              <h3 className="font-heading text-lg font-bold">{p.name}</h3>
              {p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}
              <p className="mt-6 font-heading text-4xl font-bold">
                {p.price}
                {p.period && <span className="ml-1 text-base font-normal text-muted">{p.period}</span>}
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              {/* 決済URLがあれば決済ページへ、なければ申込フォームへ */}
              <CtaLink
                cta={{ label: p.ctaLabel ?? "申し込む", href: p.checkoutUrl || "#lead" }}
                plan={p.name}
                variant={p.highlight ? "primary" : "outline"}
                event={p.checkoutUrl ? "checkout_click" : "cta_click"}
                className="mt-8 w-full"
              />
            </RevealItem>
          ))}
        </Reveal>
        {s.note && <p className="mt-10 text-center text-xs text-muted">{s.note}</p>}
      </div>
    </section>
  );
}

export function Flow(s: Of<"flow">) {
  return (
    <section id={s.id} className="scroll-mt-20 py-24">
      <div className={cn(wrap, "max-w-4xl")}>
        <Heading label={s.label} title={s.title} />
        <Reveal as="ol" className="relative space-y-6 before:absolute before:bottom-6 before:left-6 before:top-6 before:w-px before:bg-line">
          {s.steps.map((st, i) => (
            <RevealItem as="li" key={st.title} className="relative flex gap-5">
              <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-primary font-bold text-white">{i + 1}</span>
              <div className="flex-1 rounded-2xl border border-line bg-surface p-5">
                <h3 className="font-bold">{st.title}</h3>
                <p className="mt-1 text-sm text-muted">{st.body}</p>
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function Faq(s: Of<"faq">) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id={s.id} className="scroll-mt-20 bg-surface py-24">
      <div className={cn(wrap, "max-w-3xl")}>
        <Heading label={s.label} title={s.title} />
        <Reveal className="divide-y divide-line border-y border-line">
          {s.items.map((f, i) => (
            <RevealItem key={f.q}>
              <h3>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between gap-4 py-5 text-left font-bold"
                  aria-expanded={open === i}
                  aria-controls={`faq-${i}`}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  <span>
                    <span className="mr-3 text-primary">Q.</span>
                    {f.q}
                  </span>
                  <motion.span animate={{ rotate: open === i ? 180 : 0 }}>
                    <ChevronDown className="size-5 text-muted" aria-hidden />
                  </motion.span>
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    id={`faq-${i}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <p className="pb-6 pl-8 text-sm text-muted">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCta(s: Of<"cta">) {
  return (
    <section className="relative overflow-hidden bg-dark py-24 text-center text-white">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30 blur-3xl"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <Reveal className={cn(wrap, "relative")}>
        <RevealItem as="h2" className="font-heading text-2xl font-bold leading-relaxed md:text-4xl">
          <RichTitle text={s.title} />
        </RevealItem>
        {s.lead && (
          <RevealItem as="p" className="mt-4 text-white/70">
            {s.lead}
          </RevealItem>
        )}
        <RevealItem className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <CtaLink cta={s.primaryCta} />
          {s.secondaryCta && <CtaLink cta={s.secondaryCta} variant="outline-dark" />}
        </RevealItem>
      </Reveal>
    </section>
  );
}
