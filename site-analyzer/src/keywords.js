// キーワード抽出（Intl.Segmenter による日本語/英語の分かち書き + 複合語）

const STOP = new Set(`する ある いる なる こと もの これ それ あれ この その あの ため よう など また および ここ そこ さん ます です でき ください こちら について による により において として ない から まで より なく れる られる せる させる いう 私たち 当社 弊社 一覧 詳細 トップ ホーム ページ 戻る 次へ 前へ もっと 見る はこちら 続き 読む 年 月 日 時 分
the and for with that this from your you are was were have has had not but all can will our more about into than then them they their there what when which who how why its it's also just over only other some such each any may most new one two use using get see menu home page read copyright rights reserved privacy policy cookie cookies contact login`.split(/\s+/));

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;

function isContentWord(w) {
  if (w.length < 2 && !/[一-鿿]/.test(w)) return false;
  if (/^[\d０-９.,:/%-]+$/.test(w)) return false;
  if (/^[぀-ゟ]+$/.test(w)) return false; // ひらがなのみ（助詞・助動詞）
  if (STOP.has(w.toLowerCase())) return false;
  return true;
}

export function tokenize(text) {
  if (!segmenter) return (text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter(isContentWord);
  const words = [];
  let compound = [];
  const flush = () => {
    if (compound.length > 1) {
      const c = compound.join('');
      if (c.length <= 16) words.push(c);
    }
    compound = [];
  };
  for (const seg of segmenter.segment(text)) {
    const w = seg.segment.trim();
    if (!seg.isWordLike || !w) { flush(); continue; }
    const lw = /^[a-z]/i.test(w) ? w.toLowerCase() : w;
    if (isContentWord(lw)) {
      words.push(lw);
      // 漢字・カタカナ・英字の連続は複合語として結合（例：沖縄 + 物流 → 沖縄物流）
      if (/^[一-鿿゠-ヿー]+$/.test(w)) compound.push(w); else flush();
    } else flush();
  }
  flush();
  return words;
}

export function topTerms(text, n = 15) {
  const counts = new Map();
  for (const w of tokenize(text)) counts.set(w, (counts.get(w) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map(([term, count]) => ({ term, count }));
}

/** サイト全体のキーワード（TF-IDF風：多くのページに出る語は定型文として減点） */
export function analyzeKeywords(pages) {
  const docs = pages.filter((p) => p.text);
  const df = new Map();
  const perPage = new Map();
  for (const p of docs) {
    const counts = new Map();
    // title・見出しは重み付け
    const weighted = [p.title, p.title, ...(p.headings || []).map((h) => h.text), p.text].join(' ');
    for (const w of tokenize(weighted)) counts.set(w, (counts.get(w) || 0) + 1);
    perPage.set(p.url, counts);
    for (const w of counts.keys()) df.set(w, (df.get(w) || 0) + 1);
  }
  const N = docs.length || 1;
  const pageKeywords = {};
  const siteScore = new Map();
  for (const [url, counts] of perPage) {
    const scored = [...counts.entries()].map(([w, c]) => {
      const idf = Math.log(1 + N / (df.get(w) || 1));
      const boilerplate = N >= 5 && (df.get(w) || 0) / N > 0.8;
      return { term: w, count: c, score: boilerplate ? 0 : c * idf };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);
    pageKeywords[url] = scored;
    for (const x of scored.slice(0, 5)) siteScore.set(x.term, (siteScore.get(x.term) || 0) + x.score);
  }
  const site = [...siteScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([term, score]) => ({ term, score: +score.toFixed(1), pages: df.get(term) || 0 }));

  // カニバリゼーション（同じ主要キーワードを狙うページが複数）
  const byMain = new Map();
  for (const [url, kws] of Object.entries(pageKeywords)) {
    const main = kws[0]?.term;
    if (!main) continue;
    if (!byMain.has(main)) byMain.set(main, []);
    byMain.get(main).push(url);
  }
  const cannibal = [...byMain.entries()].filter(([, urls]) => urls.length >= 2).map(([term, urls]) => ({ term, urls }));
  return { site, pageKeywords, cannibal };
}

/** MinHashによる重複・類似コンテンツ検出 */
export function findDuplicates(pages, threshold = 0.85) {
  const K = 64;
  const seeds = Array.from({ length: K }, (_, i) => (i + 1) * 0x9e3779b1);
  const hash = (s, seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995) >>> 0;
    return (h ^ (h >>> 15)) >>> 0;
  };
  const sigs = [];
  for (const p of pages) {
    if (!p.text || p.textLength < 200) continue;
    const t = p.text.replace(/\s+/g, '');
    const sig = new Array(K).fill(0xffffffff);
    for (let i = 0; i + 8 <= t.length; i += 2) {
      const sh = t.slice(i, i + 8);
      for (let k = 0; k < K; k++) { const v = hash(sh, seeds[k]); if (v < sig[k]) sig[k] = v; }
    }
    sigs.push({ url: p.url, sig });
  }
  const pairs = [];
  for (let i = 0; i < sigs.length; i++) for (let j = i + 1; j < sigs.length; j++) {
    let same = 0;
    for (let k = 0; k < K; k++) if (sigs[i].sig[k] === sigs[j].sig[k]) same++;
    const sim = same / K;
    if (sim >= threshold) pairs.push({ a: sigs[i].url, b: sigs[j].url, similarity: +sim.toFixed(2) });
    if (pairs.length > 200) return pairs;
  }
  return pairs;
}
