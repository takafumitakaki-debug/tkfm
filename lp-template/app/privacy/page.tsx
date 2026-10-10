import type { Metadata } from "next";
import { DocPage } from "@/components/sections/doc-page";
import { site } from "@/content/site";

export const metadata: Metadata = { title: `プライバシーポリシー｜${site.brand.name}` };

// ひな形。公開前に、実際の取り扱いに合わせて見直すこと
export default function Privacy() {
  const items: [string, string][] = [
    ["取得する情報", "お問い合わせ・お申込みの際にご入力いただいた、お名前・メールアドレス・電話番号・お問い合わせ内容。"],
    ["利用目的", "お問い合わせへの回答、サービスのご案内・提供、お支払いの確認のために利用します。"],
    ["第三者への提供", "法令に基づく場合を除き、ご本人の同意なく第三者に提供しません。フォーム送信・決済のために外部サービスを利用する場合があります。"],
    ["アクセス解析", "サイトの改善のため、Google アナリティクス等のアクセス解析ツールを利用する場合があります。データは匿名で収集され、個人を特定するものではありません。"],
    ["開示・訂正・削除", "ご本人からの請求があった場合は、本人確認のうえ速やかに対応します。"],
    ["お問い合わせ窓口", site.privacyContact],
  ];
  return (
    <DocPage title="プライバシーポリシー">
      <p className="text-sm text-muted">{site.brand.name}（以下「当方」）は、お客様の個人情報を以下のとおり取り扱います。</p>
      <div className="mt-8 space-y-8 text-sm">
        {items.map(([h, b]) => (
          <section key={h}>
            <h2 className="font-bold">{h}</h2>
            <p className="mt-2 text-muted">{b}</p>
          </section>
        ))}
      </div>
    </DocPage>
  );
}
