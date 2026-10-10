import { site } from "@/content/site";

// 特商法表記・プライバシーポリシーなどの文章ページの枠
export function DocPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <a href="/" className="text-sm text-primary">
        ← {site.brand.name} トップへ
      </a>
      <h1 className="mt-8 font-heading text-3xl font-bold">{title}</h1>
      <div className="mt-10">{children}</div>
    </main>
  );
}
