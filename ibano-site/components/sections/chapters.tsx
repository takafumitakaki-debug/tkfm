"use client";

import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Chapter, Placeholder } from "@/components/sections/chapter";
import { Marquee } from "@/components/ui/marquee";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Photo } from "@/components/ui/photo";
import { Reveal, RevealItem } from "@/components/ui/reveal";

export function About() {
  return (
    <Chapter
      id="about"
      no="01"
      ja="理念"
      en="ABOUT"
      question="なぜ、イバノはこの仕事を続けているのか。"
      cta={[{ label: "理念と、イバノの歩みを読む", href: "/about/" }]}
    >
      <Reveal className="mx-auto max-w-3xl py-8 text-center">
        <RevealItem as="p" className="font-serif text-2xl leading-loose md:text-3xl">
          <Placeholder>【経営理念原稿を配置】</Placeholder>
        </RevealItem>
        <RevealItem as="p" className="mt-8 text-muted">
          <Placeholder>【経営理念の解説原稿を配置（150〜200字）】</Placeholder>
        </RevealItem>
        <RevealItem as="p" className="mt-8 text-sm text-muted">
          「<Placeholder>【代表メッセージから抜粋して配置】</Placeholder>」 ― 代表取締役 平良 秀樹（要確認）
        </RevealItem>
      </Reveal>
      <Reveal className="mt-12">
        <RevealItem>
          <Photo note="創業期（1963年頃）の店舗・輸入牛肉・創業者。なければ倉庫で撮る代表のポートレート" className="aspect-[21/9]" />
        </RevealItem>
      </Reveal>
    </Chapter>
  );
}

const philosophy = [
  { t: "【フィロソフィ項目①】", ex: "検品で、肉の色を自分の目で確かめる", photo: "検品で肉の色を見る手" },
  { t: "【フィロソフィ項目②】", ex: "伝票の一行まで、取引先の目線で確認する", photo: "伝票を確認する手" },
  { t: "【フィロソフィ項目③】", ex: "店頭で、使い道まで一緒に考えて包む", photo: "店舗で包む手" },
];

export function Philosophy() {
  return (
    <Chapter
      id="philosophy"
      no="02"
      ja="フィロソフィ"
      en="PHILOSOPHY"
      question="理念を、毎日の仕事でどう形にしているか。"
      cta={[{ label: "フィロソフィの全文を読む", href: "/philosophy/" }]}
      dark
    >
      <Reveal as="ol" className="grid gap-6 md:grid-cols-3">
        {philosophy.map((p, i) => (
          <RevealItem as="li" key={p.t}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="h-full rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <Photo note={p.photo} tone="dark" className="aspect-[4/3]" />
              <p className="mt-5 font-serif text-4xl text-accent-soft">02-{i + 1}</p>
              <h3 className="mt-2 font-bold">{p.t}</h3>
              <p className="mt-3 text-sm text-white/70">現場では：{p.ex}（例）</p>
            </motion.div>
          </RevealItem>
        ))}
      </Reveal>
    </Chapter>
  );
}

const flow = ["世界・県内の生産者", "調達・輸入", "保管・加工", "営業・提案", "配送", "ホテル／飲食店／家庭"];

const businesses = [
  { to: "ホテル・レストラン・居酒屋へ", what: "業務用食材の卸販売", photo: "ホテル厨房での納品", href: "/business/#wholesale" },
  { to: "世界と県内の食材を、沖縄へ", what: "国内外の食材の調達・輸入", photo: "冷凍・冷蔵倉庫での検品", href: "/business/#import" },
  { to: "家庭の食卓へ", what: "イバノ牧港店／IVANO SELECT", photo: "精肉ショーケースとスタッフ", href: "/business/#shop" },
  { to: "イバノにしかない商品を", what: "自社PB商品の開発", photo: "PB商品が料理に使われる場面", href: "/business/#pb" },
];

const numbers = [
  { label: "創業", value: 1963, unit: "年", year: true },
  { label: "社員数", value: 147, unit: "名", check: true },
  { label: "IVANO SELECT 取扱国", value: 35, unit: "か国", check: true },
];

export function Business() {
  return (
    <Chapter
      id="business"
      no="03"
      ja="事業"
      en="BUSINESS"
      question="その考え方を、どんな仕事で実現しているのか。"
      cta={[
        { label: "事業について詳しく", href: "/business/" },
        { label: "お取引のご相談", href: "/contact/?type=business" },
      ]}
    >
      <p className="max-w-3xl text-muted">
        <Placeholder>【事業全体を説明する原稿を配置（理念とのつながりを1文入れる）】</Placeholder>
      </p>

      {/* 図解：食材が沖縄の食卓に届くまで */}
      <Reveal className="mt-12 rounded-2xl border border-line bg-surface p-6 md:p-8">
        <RevealItem as="h3" className="mb-6 text-sm font-bold tracking-widest text-muted">
          食材が沖縄の食卓に届くまで
        </RevealItem>
        <ol className="flex flex-col gap-3 md:flex-row md:items-center md:gap-2">
          {flow.map((f, i) => (
            <RevealItem as="li" key={f} className="flex items-center gap-2 md:flex-1">
              <span
                className={
                  i === flow.length - 1
                    ? "w-full rounded-lg bg-primary px-3 py-3 text-center text-sm font-bold text-white"
                    : "w-full rounded-lg bg-bg px-3 py-3 text-center text-sm"
                }
              >
                {f}
              </span>
              {i < flow.length - 1 && <ChevronRight className="hidden size-4 shrink-0 text-accent md:block" aria-hidden />}
            </RevealItem>
          ))}
        </ol>
      </Reveal>

      <Reveal className="mt-12 grid gap-6 sm:grid-cols-2">
        {businesses.map((b, i) => (
          <RevealItem key={b.to}>
            <motion.a
              href={b.href}
              whileHover="hover"
              className="group block overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <motion.div variants={{ hover: { scale: 1.04 } }} transition={{ duration: 0.4 }}>
                <Photo note={b.photo} tone={i % 2 ? "gold" : "warm"} className="aspect-[16/9] rounded-none" />
              </motion.div>
              <div className="p-6">
                <p className="text-xs tracking-widest text-accent">0{i + 1}</p>
                <h3 className="mt-1 font-serif text-xl font-bold">{b.to}</h3>
                <p className="mt-1 text-sm text-muted">{b.what}</p>
                <p className="mt-4 inline-flex items-center gap-1 text-sm text-primary">
                  詳しく見る <ChevronRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </p>
              </div>
            </motion.a>
          </RevealItem>
        ))}
      </Reveal>

      <Reveal className="mt-16 grid grid-cols-2 gap-8 border-y border-line py-10 md:grid-cols-4">
        {numbers.map((n) => (
          <RevealItem key={n.label}>
            <p className="text-sm text-muted">{n.label}</p>
            <p className="mt-1 font-serif text-4xl font-bold text-primary md:text-5xl">
              <NumberTicker value={n.value} grouping={!("year" in n)} />
              <span className="ml-1 text-base text-ink">{n.unit}</span>
            </p>
            {n.check && <p className="mt-1 text-xs text-accent">要確認</p>}
          </RevealItem>
        ))}
        <RevealItem>
          <p className="text-sm text-muted">取引先数</p>
          <p className="mt-1 font-serif text-2xl text-muted">【要確認】</p>
        </RevealItem>
      </Reveal>
    </Chapter>
  );
}

const people = [
  { dept: "営業部", year: "20XX年入社", photo: "取引先へ向かう前の営業" },
  { dept: "物流部・配送", year: "20XX年入社", photo: "トラックの前の配送スタッフ" },
  { dept: "倉庫・検品", year: "20XX年入社", photo: "冷蔵倉庫で検品するスタッフ" },
  { dept: "イバノ牧港店", year: "20XX年入社", photo: "ショーケース前の店舗スタッフ" },
];

export function People() {
  return (
    <Chapter
      id="people"
      no="04"
      ja="人"
      en="PEOPLE"
      question="イバノを支えているのは、誰なのか。"
      cta={[
        { label: "イバノの人と仕事を見る", href: "/people/" },
        { label: "採用情報へ", href: "/recruit/" },
      ]}
    >
      <p className="max-w-3xl text-muted">
        <Placeholder>【人に関する会社の考え方を配置】</Placeholder>
      </p>
      {/* 横スクロールの社員カード（スマホは指でスワイプ） */}
      <Reveal className="-mx-4 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {people.map((p) => (
          <RevealItem key={p.dept} className="w-64 shrink-0 snap-start md:w-auto">
            <Photo note={p.photo} className="aspect-[3/4]" />
            <p className="mt-4 font-serif">「<Placeholder>【社員の言葉を配置】</Placeholder>」</p>
            <p className="mt-2 text-xs text-muted">
              {p.dept} ◯◯ ◯◯（{p.year}）
            </p>
          </RevealItem>
        ))}
      </Reveal>
    </Chapter>
  );
}

const area = [
  { t: "沖縄の食の現場とともに", d: "県内のホテル・飲食店との長い取引、繁忙期・台風時の供給", photo: "取引先の店主とイバノ社員" },
  { t: "沖縄の食材とともに", d: "県産黒毛和牛・琉球あぐーなど、県内生産者との関係", photo: "県内の牧場で生産者と社員" },
  { t: "浦添・地域とともに", d: "地域行事への協賛、URASOE FRONTIER COMPANY 認定など", photo: "地域イベントでの協賛・参加" },
];

export function Area() {
  return (
    <>
      <Chapter
        id="area"
        no="05"
        ja="地域"
        en="AREA"
        question="イバノの仕事は、沖縄に何を生んでいるのか。"
        cta={[{ label: "地域との関わりを見る", href: "/area/" }]}
        dark
      >
        <Reveal className="grid gap-8 md:grid-cols-3">
          {area.map((a, i) => (
            <RevealItem key={a.t}>
              <Photo note={a.photo} tone="dark" className="aspect-[4/3]" />
              <h3 className="mt-5 font-serif text-xl font-bold">
                <span className="mr-2 text-accent-soft">{i + 1}</span>
                {a.t}
              </h3>
              <p className="mt-2 text-sm text-white/70">{a.d}</p>
              <p className="mt-2 text-xs text-white/50">【実例を配置】</p>
            </RevealItem>
          ))}
        </Reveal>
        <Reveal className="mt-24 text-center">
          <RevealItem as="p" className="font-serif text-3xl font-bold md:text-5xl">
            沖縄の食を支える。
          </RevealItem>
        </Reveal>
      </Chapter>
      <Marquee
        className="bg-primary py-4 font-serif text-sm tracking-[0.3em] text-white/90"
        items={["HOTEL", "RESTAURANT", "IZAKAYA", "HOME", "OKINAWA", "SINCE 1963"]}
      />
    </>
  );
}
