"use client";

import { ArrowRight } from "lucide-react";
import type { Cta } from "@/content/types";
import { track } from "@/lib/track";
import { cn } from "@/lib/utils";

// 申込みにつながるボタン。押されたら計測する
export function CtaLink({
  cta,
  variant = "primary",
  className,
  event = "cta_click",
  plan,
}: {
  cta: Cta;
  variant?: "primary" | "outline" | "outline-dark";
  className?: string;
  event?: "cta_click" | "checkout_click";
  plan?: string; // 料金プランから押されたとき、申込フォームにプラン名を入れる
}) {
  const external = /^https?:\/\//.test(cta.href);
  const line = cta.href.includes("line.me");
  return (
    <a
      href={cta.href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={() => {
        track(line ? "line_click" : event, { label: cta.label, ...(plan ? { plan } : {}) });
        if (plan && !external) window.dispatchEvent(new CustomEvent("select-plan", { detail: plan }));
      }}
      className={cn(
        "group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-bold transition-colors",
        variant === "primary" && "bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary-strong",
        variant === "outline" && "border border-ink/20 hover:bg-ink/5",
        variant === "outline-dark" && "border border-white/30 text-white hover:bg-white/10",
        className,
      )}
    >
      {cta.label}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
    </a>
  );
}
