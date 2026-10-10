import { cn } from "@/lib/utils";

// 写真の仮置き枠。撮影後は next/image に差し替える（中の文字は撮影指示）
export function Photo({ note, className, tone = "warm" }: { note: string; className?: string; tone?: "warm" | "dark" | "gold" }) {
  const tones = {
    warm: "from-[#e9d8c4] via-[#d9bfa3] to-[#c49a7a]",
    dark: "from-[#3a2620] via-[#2a1a14] to-[#1c1210]",
    gold: "from-[#efd9a8] via-[#d8b26b] to-[#a16207]",
  };
  return (
    <div
      role="img"
      aria-label={`写真（仮）：${note}`}
      className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br", tones[tone], className)}
    >
      <span
        className={cn(
          "absolute bottom-3 left-3 right-3 text-xs leading-snug",
          tone === "dark" ? "text-white/70" : "text-ink/60",
        )}
      >
        PHOTO：{note}
      </span>
    </div>
  );
}
