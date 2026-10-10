import { ArrowRight } from "lucide-react";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

// 01〜05 の章は「問い → 要点 → 証拠 → 章ページへ」の同じ型で揃える（docs/02）
export function Chapter({
  id,
  no,
  ja,
  en,
  question,
  children,
  cta,
  dark = false,
}: {
  id: string;
  no: string;
  ja: string;
  en: string;
  question: string;
  children: React.ReactNode;
  cta: { label: string; href: string }[];
  dark?: boolean;
}) {
  return (
    <section id={id} className={cn("scroll-mt-16 py-24 md:py-36", dark && "bg-night text-white")}>
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="mb-14 md:mb-20">
          <RevealItem className="flex items-baseline gap-4">
            <span className={cn("font-serif text-6xl md:text-8xl", dark ? "text-accent-soft" : "text-primary")}>{no}</span>
            <span className={cn("text-sm tracking-[0.25em]", dark ? "text-white/70" : "text-muted")}>
              {ja} / {en}
            </span>
          </RevealItem>
          <RevealItem as="h2" className="mt-6 max-w-3xl font-serif text-2xl font-bold leading-relaxed md:text-4xl">
            {question}
          </RevealItem>
        </Reveal>
        {children}
        <Reveal className="mt-14 flex flex-wrap gap-4">
          {cta.map((c, i) => (
            <RevealItem key={c.href}>
              <a
                href={c.href}
                className={cn(
                  "group inline-flex min-h-11 items-center gap-3 rounded-full px-6 py-3 text-sm transition-colors",
                  i === 0
                    ? "bg-primary text-white hover:bg-primary-strong"
                    : dark
                      ? "border border-white/30 hover:bg-white/10"
                      : "border border-ink/20 hover:bg-ink/5",
                )}
              >
                {c.label}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </a>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// 正式原稿が届くまでの仮置き（ワイヤーフレームの青い破線と同じ扱い）
export function Placeholder({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("rounded border border-dashed border-current/40 px-1.5 opacity-80", className)}>{children}</span>
  );
}
