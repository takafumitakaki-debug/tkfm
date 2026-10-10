"use client";

import { motion } from "framer-motion";
import { ArrowRight, Building2, HelpCircle, Phone, ShoppingBag, Users } from "lucide-react";
import { Photo } from "@/components/ui/photo";
import { Reveal, RevealItem } from "@/components/ui/reveal";

function SectionTitle({ en, ja }: { en: string; ja: string }) {
  return (
    <RevealItem as="h2" className="font-serif text-3xl font-bold md:text-4xl">
      {en}
      <span className="ml-4 align-middle text-sm font-normal text-muted">{ja}</span>
    </RevealItem>
  );
}

const news = [
  { date: "2026.10.01", cat: "お知らせ", title: "【ニュースタイトルを配置】" },
  { date: "2026.09.15", cat: "店舗", title: "【ニュースタイトルを配置】" },
  { date: "2026.09.01", cat: "採用", title: "【ニュースタイトルを配置】" },
];

export function News() {
  return (
    <section id="news" className="scroll-mt-16 py-24">
      <Reveal className="mx-auto max-w-6xl px-4 md:px-8">
        <SectionTitle en="NEWS" ja="お知らせ" />
        <ul className="mt-10 border-t border-line">
          {news.map((n, i) => (
            <RevealItem as="li" key={i} className="border-b border-line">
              <a href="/news/" className="group flex flex-col gap-1 py-5 transition-colors hover:bg-surface md:flex-row md:items-center md:gap-8 md:px-2">
                <span className="text-sm tabular-nums text-muted">{n.date}</span>
                <span className="w-fit rounded-full border border-line px-3 text-xs">{n.cat}</span>
                <span className="flex-1">{n.title}</span>
                <ArrowRight className="hidden size-4 text-primary transition-transform group-hover:translate-x-1 md:block" aria-hidden />
              </a>
            </RevealItem>
          ))}
        </ul>
        <RevealItem className="mt-8 text-right">
          <a href="/news/" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary">
            ニュース一覧へ <ArrowRight className="size-4" aria-hidden />
          </a>
        </RevealItem>
      </Reveal>
    </section>
  );
}

export function Recruit() {
  return (
    <section id="recruit" className="scroll-mt-16 bg-surface py-24">
      <Reveal className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2 md:px-8">
        <div>
          <SectionTitle en="RECRUIT" ja="採用情報" />
          <RevealItem as="p" className="mt-6 font-serif text-xl leading-relaxed">
            【採用メッセージを配置】
          </RevealItem>
          <RevealItem className="mt-6 flex flex-wrap gap-2">
            {["営業", "配送", "倉庫", "店舗"].map((t) => (
              <span key={t} className="rounded-full bg-bg px-4 py-1 text-sm">
                {t}
              </span>
            ))}
          </RevealItem>
          <RevealItem className="mt-8 flex flex-wrap gap-3">
            <a href="/recruit/" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm text-white hover:bg-primary-strong">
              採用サイトを見る <ArrowRight className="size-4" aria-hidden />
            </a>
            <a href="/recruit/jobs/new-graduate/" className="inline-flex min-h-11 items-center rounded-full border border-ink/20 px-5 text-sm hover:bg-ink/5">
              新卒採用
            </a>
            <a href="/recruit/jobs/mid-career/" className="inline-flex min-h-11 items-center rounded-full border border-ink/20 px-5 text-sm hover:bg-ink/5">
              中途採用
            </a>
          </RevealItem>
        </div>
        <RevealItem>
          <Photo note="社員同士が仕事中に話している自然な様子" className="aspect-[3/2]" />
        </RevealItem>
      </Reveal>
    </section>
  );
}

export function Company() {
  const rows = [
    ["会社名", "株式会社イバノ"],
    ["創業", "1963年（要確認）"],
    ["本社所在地", "沖縄県浦添市（要確認）"],
    ["事業内容", "業務用食材の卸販売・輸入、小売店舗の運営、自社商品の開発"],
  ];
  return (
    <section id="company" className="scroll-mt-16 py-24">
      <Reveal className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2 md:px-8">
        <div>
          <SectionTitle en="COMPANY" ja="会社情報" />
          <dl className="mt-8 border-t border-line">
            {rows.map(([k, v]) => (
              <RevealItem key={k} className="grid grid-cols-[7rem_1fr] gap-4 border-b border-line py-4 text-sm">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </RevealItem>
            ))}
          </dl>
          <RevealItem className="mt-6 flex gap-6 text-sm text-primary">
            <a href="/company/" className="py-2">会社概要</a>
            <a href="/company/#history" className="py-2">沿革</a>
            <a href="/company/#access" className="py-2">アクセス</a>
          </RevealItem>
        </div>
        <RevealItem>
          <Photo note="本社（または倉庫）外観" className="aspect-[4/3]" />
        </RevealItem>
      </Reveal>
    </section>
  );
}

const contacts = [
  { icon: Building2, t: "お取引のご相談", d: "飲食店・ホテル・小売の方", type: "business" },
  { icon: ShoppingBag, t: "店舗・商品について", d: "イバノ牧港店・IVANO SELECT", type: "shop" },
  { icon: Users, t: "採用について", d: "新卒・中途採用", type: "recruit" },
  { icon: HelpCircle, t: "その他", d: "取材・協賛など", type: "other" },
];

export function Contact() {
  return (
    <section id="contact" className="scroll-mt-16 bg-night py-24 text-white">
      <Reveal className="mx-auto max-w-6xl px-4 md:px-8">
        <RevealItem as="h2" className="font-serif text-3xl font-bold md:text-4xl">
          CONTACT<span className="ml-4 align-middle text-sm font-normal text-white/60">お問い合わせ</span>
        </RevealItem>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {contacts.map(({ icon: Icon, t, d, type }) => (
            <RevealItem key={type}>
              <motion.a
                href={`/contact/?type=${type}`}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
                className="flex h-full flex-col rounded-2xl border border-white/15 bg-white/5 p-6 transition-colors hover:border-accent-soft"
              >
                <Icon className="size-6 text-accent-soft" aria-hidden />
                <span className="mt-4 font-bold">{t}</span>
                <span className="mt-1 text-sm text-white/60">{d}</span>
                <span className="mt-6 inline-flex items-center gap-1 text-sm">
                  フォームへ <ArrowRight className="size-4" aria-hidden />
                </span>
              </motion.a>
            </RevealItem>
          ))}
        </div>
        <RevealItem as="p" className="mt-10 flex items-center gap-2 text-sm text-white/70">
          <Phone className="size-4" aria-hidden /> お電話：【電話番号・受付時間 要確認】
        </RevealItem>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-night px-4 py-10 text-xs text-white/50 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 md:flex-row">
        <p className="font-serif text-base tracking-widest text-white/80">IVANO</p>
        <p>© 株式会社イバノ ／ 本サイトは制作中のデモです（写真・原稿は仮置き）</p>
      </div>
    </footer>
  );
}
