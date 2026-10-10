// サイトの中身はすべてこの型に沿って書く。デザインやコードを触らずに、業種ごとの内容を入れ替えられる。

export type Theme = {
  primary: string; // ボタン・強調色
  primaryStrong: string; // ボタンのホバー
  accent: string; // 小さな強調（ラベル・番号）
  bg: string; // 背景
  surface: string; // カードの背景
  ink: string; // 本文の文字色
  muted: string; // 補足の文字色
  line: string; // 罫線
  dark: string; // 暗いセクションの背景
  font: "gothic" | "mincho"; // 見出しの書体
};

export type Cta = { label: string; href: string };

// 画像は public/ に置いてパスを書く（例：/images/hero.jpg）。未設定なら仮の色枠が出る。
export type Image = { src?: string; alt: string };

export type Section =
  | {
      type: "hero";
      eyebrow?: string;
      title: string; // 改行は \n
      rotatingWords?: string[]; // title の中の {rotate} が入れ替わる単語になる
      lead: string;
      primaryCta: Cta;
      secondaryCta?: Cta;
      badges?: string[]; // 「初回無料」「全国対応」など
      image?: Image;
    }
  | { type: "logos"; title?: string; items: string[] }
  | { type: "problems"; id?: string; title: string; items: string[]; answer: string }
  | {
      type: "features";
      id?: string;
      label: string;
      title: string;
      lead?: string;
      items: { title: string; body: string; icon?: IconName; image?: Image }[];
    }
  | { type: "stats"; items: { label: string; value: number; unit?: string; note?: string; noGrouping?: boolean }[] }
  | {
      type: "testimonials";
      id?: string;
      label: string;
      title: string;
      items: { quote: string; name: string; role?: string; image?: Image }[];
    }
  | {
      type: "pricing";
      id?: string;
      label: string;
      title: string;
      lead?: string;
      note?: string; // 「表示価格は税込です」など
      plans: Plan[];
    }
  | { type: "flow"; id?: string; label: string; title: string; steps: { title: string; body: string }[] }
  | { type: "faq"; id?: string; label: string; title: string; items: { q: string; a: string }[] }
  | {
      type: "lead";
      id?: string;
      label: string;
      title: string;
      lead: string;
      // 申込みの種類（「無料相談」「資料請求」など）。選んだ値がフォームと一緒に送られる
      topics: string[];
      submitLabel: string;
      gift?: string; // 「今なら◯◯をプレゼント」などの特典
    }
  | { type: "cta"; title: string; lead?: string; primaryCta: Cta; secondaryCta?: Cta };

export type Plan = {
  name: string;
  price: string; // 「¥29,800」「要相談」など表示用の文字
  period?: string; // 「/月」「（税込）」
  description?: string;
  features: string[];
  // 決済ページのURL（Stripe Payment Links・BASE・STORES など）。未設定なら申込フォームへ飛ぶ
  checkoutUrl?: string;
  ctaLabel?: string;
  highlight?: boolean; // 「おすすめ」表示
};

export type IconName =
  | "sparkles"
  | "zap"
  | "shield"
  | "heart"
  | "clock"
  | "smartphone"
  | "trending"
  | "users"
  | "message"
  | "star"
  | "check"
  | "gift";

export type SiteConfig = {
  brand: { name: string; logoText: string; tagline?: string };
  theme: Theme;
  seo: { title: string; description: string; url?: string; ogImage?: string };
  nav: { label: string; href: string }[];
  headerCta: Cta;
  // 申込フォームの送信先（Formspree・Getform・自前API など、POST を受け付けるURL）。
  // 未設定ならメールソフトが開く（contact.email 宛て）
  formEndpoint?: string;
  contact: { email: string; phone?: string; hours?: string; lineUrl?: string };
  analytics?: { gaId?: string; metaPixelId?: string };
  // スマホで画面下に出し続けるボタン
  stickyCta?: Cta;
  sections: Section[];
  // 特定商取引法に基づく表記（ネットで販売するなら必須）。/legal に出る
  legal: {
    seller: string;
    representative: string;
    address: string;
    phone: string;
    email: string;
    price: string;
    extraFees: string;
    payment: string;
    paymentTiming: string;
    delivery: string;
    returns: string;
  };
  privacyContact: string; // プライバシーポリシーの問い合わせ窓口
};
