import type { Metadata } from "next";
import { DocPage } from "@/components/sections/doc-page";
import { site } from "@/content/site";

export const metadata: Metadata = { title: `特定商取引法に基づく表記｜${site.brand.name}` };

export default function Legal() {
  const l = site.legal;
  const rows: [string, string][] = [
    ["販売事業者", l.seller],
    ["運営責任者", l.representative],
    ["所在地", l.address],
    ["電話番号", l.phone],
    ["メールアドレス", l.email],
    ["販売価格", l.price],
    ["商品代金以外の必要料金", l.extraFees],
    ["お支払い方法", l.payment],
    ["お支払い時期", l.paymentTiming],
    ["商品・サービスの提供時期", l.delivery],
    ["返品・キャンセル", l.returns],
  ];
  return (
    <DocPage title="特定商取引法に基づく表記">
      <dl className="border-t border-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 border-b border-line py-4 md:grid-cols-[14rem_1fr] md:gap-4">
            <dt className="font-bold">{k}</dt>
            <dd className="text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </DocPage>
  );
}
