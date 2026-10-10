import type { Theme } from "@/content/types";

const headings = {
  gothic: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif',
  mincho: '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", serif',
};

export function themeVars(t: Theme): React.CSSProperties {
  return {
    "--brand-primary": t.primary,
    "--brand-primary-strong": t.primaryStrong,
    "--brand-accent": t.accent,
    "--brand-bg": t.bg,
    "--brand-surface": t.surface,
    "--brand-ink": t.ink,
    "--brand-muted": t.muted,
    "--brand-line": t.line,
    "--brand-dark": t.dark,
    "--brand-heading": headings[t.font],
  } as React.CSSProperties;
}
