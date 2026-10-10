"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Gift, Loader2, MessageCircle, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import type { Section, SiteConfig } from "@/content/types";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { track } from "@/lib/track";

type Props = Extract<Section, { type: "lead" }> & { site: SiteConfig };
type Status = "idle" | "sending" | "done" | "error";

const field =
  "mt-1.5 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none transition-colors focus:border-primary";

// 申込み・問い合わせフォーム。formEndpoint があればそこへ送信、なければメールソフトを開く
export function LeadForm({ site, ...s }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [plan, setPlan] = useState("");
  const [topic, setTopic] = useState(s.topics[0] ?? "");

  useEffect(() => {
    const onSelect = (e: Event) => setPlan((e as CustomEvent<string>).detail);
    window.addEventListener("select-plan", onSelect);
    return () => window.removeEventListener("select-plan", onSelect);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (data.get("_gotcha")) return; // ボット対策（人には見えない欄）

    if (!site.formEndpoint) {
      const body = [...data.entries()]
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v]) => `${k}：${v}`)
        .join("\n");
      track("generate_lead", { topic });
      window.location.href = `mailto:${site.contact.email}?subject=${encodeURIComponent(`【${topic}】${site.brand.name}`)}&body=${encodeURIComponent(body)}`;
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch(site.formEndpoint, { method: "POST", body: data, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      track("generate_lead", { topic, ...(plan ? { plan } : {}) });
      setStatus("done");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  return (
    <section id={s.id} className="scroll-mt-20 py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 md:grid-cols-[1fr_1.2fr] md:px-8">
        <Reveal>
          <RevealItem as="p" className="text-xs font-bold tracking-[0.3em] text-accent">
            {s.label}
          </RevealItem>
          <RevealItem as="h2" className="mt-3 font-heading text-3xl font-bold leading-snug md:text-4xl">
            {s.title}
          </RevealItem>
          <RevealItem as="p" className="mt-4 text-muted">
            {s.lead}
          </RevealItem>
          {s.gift && (
            <RevealItem className="mt-8 flex items-start gap-3 rounded-2xl bg-accent/10 p-5 text-sm font-bold">
              <Gift className="size-5 shrink-0 text-accent" aria-hidden />
              {s.gift}
            </RevealItem>
          )}
          <RevealItem className="mt-8 space-y-3 text-sm">
            {site.contact.lineUrl && (
              <a
                href={site.contact.lineUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("line_click")}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#06C755] px-6 font-bold text-white hover:opacity-90"
              >
                <MessageCircle className="size-5" aria-hidden /> LINEで気軽に相談
              </a>
            )}
            {site.contact.phone && (
              <p className="flex items-center gap-2 text-muted">
                <Phone className="size-4" aria-hidden />
                <a href={`tel:${site.contact.phone}`} className="font-bold text-ink">
                  {site.contact.phone}
                </a>
                {site.contact.hours && <span>（{site.contact.hours}）</span>}
              </p>
            )}
          </RevealItem>
        </Reveal>

        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm md:p-10">
          <AnimatePresence mode="wait">
            {status === "done" ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-16 text-center"
                role="status"
              >
                <CheckCircle2 className="mx-auto size-14 text-primary" aria-hidden />
                <p className="mt-6 font-heading text-2xl font-bold">送信しました</p>
                <p className="mt-3 text-sm text-muted">内容を確認して、担当よりご連絡します。</p>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={onSubmit} exit={{ opacity: 0 }} className="space-y-5">
                <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
                <input type="hidden" name="_subject" value={`【${topic}】${site.brand.name}`} />
                <fieldset>
                  <legend className="text-sm font-bold">ご用件</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.topics.map((t) => (
                      <label
                        key={t}
                        className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-white"
                      >
                        <input type="radio" name="ご用件" value={t} checked={topic === t} onChange={() => setTopic(t)} className="sr-only" />
                        {t}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {plan && (
                  <label className="block text-sm font-bold">
                    ご希望のプラン
                    <input name="プラン" value={plan} onChange={(e) => setPlan(e.target.value)} className={field} />
                  </label>
                )}
                <label className="block text-sm font-bold">
                  お名前 <span className="text-accent">必須</span>
                  <input name="お名前" required autoComplete="name" className={field} />
                </label>
                <label className="block text-sm font-bold">
                  メールアドレス <span className="text-accent">必須</span>
                  <input name="email" type="email" required autoComplete="email" inputMode="email" className={field} />
                </label>
                <label className="block text-sm font-bold">
                  電話番号 <span className="font-normal text-muted">任意</span>
                  <input name="電話番号" type="tel" autoComplete="tel" inputMode="tel" className={field} />
                </label>
                <label className="block text-sm font-bold">
                  内容 <span className="font-normal text-muted">任意</span>
                  <textarea name="内容" rows={4} className={field} />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" required className="mt-1 size-4 accent-[var(--color-primary)]" />
                  <span>
                    <a href="/privacy/" target="_blank" className="text-primary underline">
                      プライバシーポリシー
                    </a>
                    に同意する
                  </span>
                </label>
                {status === "error" && (
                  <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
                    送信できませんでした。時間をおいて再度お試しいただくか、{site.contact.email} までご連絡ください。
                  </p>
                )}
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-primary font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-strong disabled:opacity-60"
                >
                  {status === "sending" && <Loader2 className="size-5 animate-spin" aria-hidden />}
                  {status === "sending" ? "送信中…" : s.submitLabel}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
