import type { Image } from "@/content/types";
import { cn } from "@/lib/utils";

// 画像。src が無いあいだは、ブランド色の仮の枠を出す（中の文字が「何の写真を入れるか」）
export function Img({ image, className, dark = false }: { image?: Image; className?: string; dark?: boolean }) {
  if (image?.src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image.src} alt={image.alt} loading="lazy" className={cn("rounded-2xl object-cover", className)} />;
  }
  return (
    <div
      role="img"
      aria-label={image?.alt ?? "画像（未設定）"}
      className={cn(
        "relative overflow-hidden rounded-2xl",
        dark ? "bg-white/10" : "bg-[color-mix(in_srgb,var(--color-primary)_14%,var(--color-surface))]",
        className,
      )}
    >
      <span className={cn("absolute bottom-3 left-3 right-3 text-xs", dark ? "text-white/60" : "text-muted")}>
        IMAGE：{image?.alt ?? "画像を設定"}
      </span>
    </div>
  );
}
