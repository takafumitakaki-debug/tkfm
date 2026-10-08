// 曖昧な検索語を「検索しやすい形」に推測・展開する（ルールベース）。
//   - 全角/半角・ひらがな/カタカナのゆれをそろえる
//   - サイズや容量（27cm, 128GB…）は検索語から外し、絞り込み条件として扱う
//   - 文字種の境目に空白を入れる（モナルシーダネオ3 → モナルシーダ ネオ 3）
//   - カタカナ語⇔英字、数字⇔ローマ数字の言い換え候補を作る
//   - ヒットしなければ語を減らして広げる（緩和検索）

// 商品名によく出るカタカナ語 ⇔ 英字
const KANA_ALIASES = {
  ネオ: 'neo', ワイド: 'wide', エリート: 'elite', プロ: 'pro', ライト: 'light', マックス: 'max',
  ミニ: 'mini', ウルトラ: 'ultra', プラス: 'plus', エアー: 'air', エア: 'air', スーパー: 'super',
  ジャパン: 'japan', アドバンス: 'advance', プレミアム: 'premium', スリム: 'slim', ハイ: 'hi',
  ロー: 'low', ミッド: 'mid', ジュニア: 'jr', キッズ: 'kids', セレクト: 'select', クラブ: 'club',
  アカデミー: 'academy', エボ: 'evo', ゼロ: 'zero', ワン: 'one', ツー: 'two', スリー: 'three',
};
const EN_ALIASES = Object.fromEntries(Object.entries(KANA_ALIASES).map(([k, v]) => [v, k]));
const ROMAN = { 1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi', 7: 'vii', 8: 'viii', 9: 'ix', 10: 'x' };
const ROMAN_REV = Object.fromEntries(Object.entries(ROMAN).map(([k, v]) => [v, k]));

// サイズ・容量など「検索語ではなく条件」として扱う表現
const ATTR_PATTERNS = [
  { type: 'size', re: /(\d{1,2}(?:\.\d)?)\s*(cm|センチ)/gi, unit: 'cm' },
  { type: 'capacity', re: /(\d+(?:\.\d+)?)\s*(gb|tb|mah|ml|l|kg|g)\b/gi },
  { type: 'inch', re: /(\d{1,3}(?:\.\d)?)\s*(インチ|型|inch)/gi, unit: 'インチ' },
];

function toKatakana(s) {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

function normalizeQuery(q) {
  return String(q || '')
    .normalize('NFKC')
    .replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, (c) => ROMAN[c.charCodeAt(0) - 0x215f])
    .replace(/[\s　]+/g, ' ')
    .trim();
}

function extractAttributes(q) {
  const attrs = [];
  let core = q;
  for (const p of ATTR_PATTERNS) {
    core = core.replace(p.re, (text, num, unit) => {
      attrs.push({ type: p.type, value: Number(num), unit: p.unit || unit.toLowerCase(), text: text.trim() });
      return ' ';
    });
  }
  return { core: core.replace(/\s+/g, ' ').trim(), attrs };
}

// 文字種（カタカナ / 英字 / 数字 / 漢字）の境目で区切る
function splitByScript(s) {
  const kind = (c) =>
    /[゠-ヿー]/.test(c) ? 'k' : /[a-z]/i.test(c) ? 'a' : /\d/.test(c) ? 'd' : /\s/.test(c) ? 's' : 'o';
  const tokens = [];
  let cur = '';
  let prev = null;
  for (const c of s) {
    const k = kind(c);
    if (k === 's') {
      if (cur) tokens.push(cur);
      cur = '';
      prev = null;
      continue;
    }
    if (prev && k !== prev && !(prev === 'a' && k === 'd') && !(prev === 'd' && k === 'a')) {
      tokens.push(cur);
      cur = '';
    }
    cur += c;
    prev = k;
  }
  if (cur) tokens.push(cur);
  // 長いカタカナ連続の末尾に既知語があれば切り出す（モナルシーダネオ → モナルシーダ ネオ）
  return tokens.flatMap((t) => {
    if (!/^[゠-ヿー]+$/.test(t)) return [t];
    for (const w of Object.keys(KANA_ALIASES).sort((a, b) => b.length - a.length)) {
      if (t.length > w.length + 1 && t.endsWith(w)) return [...splitByScript(t.slice(0, -w.length)), w];
    }
    return [t];
  });
}

function aliasToken(tok, mode) {
  const low = tok.toLowerCase();
  if (mode === 'en') {
    if (KANA_ALIASES[tok]) return KANA_ALIASES[tok];
    if (/^\d+$/.test(tok) && ROMAN[tok]) return ROMAN[tok];
  }
  if (mode === 'kana') {
    if (EN_ALIASES[low]) return EN_ALIASES[low];
    if (ROMAN_REV[low]) return ROMAN_REV[low];
  }
  return tok;
}

function uniq(list) {
  const seen = new Set();
  return list.filter((x) => {
    const k = x.toLowerCase();
    if (!x || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// 検索候補を「厳密 → 言い換え → 緩和」の順に返す
function analyzeQuery(raw) {
  const normalized = normalizeQuery(raw);
  const { core, attrs } = extractAttributes(normalized);
  const tokens = splitByScript(core || normalized);
  const spaced = tokens.join(' ');
  const en = tokens.map((t) => aliasToken(t, 'en')).join(' ');
  const enDigits = tokens.map((t) => (/^\d+$/.test(t) ? t : aliasToken(t, 'en'))).join(' ');
  const kana = tokens.map((t) => aliasToken(t, 'kana')).join(' ');
  const katakana = toKatakana(spaced); // ろぼっと → ロボット（ひらがな入力の救済）

  const relaxed = [];
  for (let n = tokens.length - 1; n >= 1; n--) relaxed.push(tokens.slice(0, n).join(' '));

  return {
    raw,
    normalized,
    core: spaced,
    tokens,
    attrs,
    candidates: uniq([raw.trim(), core, spaced, katakana, kana, enDigits, en, ...relaxed]),
  };
}

// 商品名が検索語にどれだけ合っているか（0〜1）。言い換え語も一致とみなす
function relevance(title, tokens) {
  if (!tokens.length) return 1;
  const fold = (x) => toKatakana(normalizeQuery(x)).toLowerCase().replace(/[\s\-_.]/g, '');
  const t = fold(title);
  let hit = 0;
  for (const tok of tokens) {
    const forms = [tok, aliasToken(tok, 'en'), aliasToken(tok, 'kana')];
    if (forms.some((f) => t.includes(fold(f)))) hit++;
  }
  return hit / tokens.length;
}

// 条件（サイズ等）に合うか：true=合う / false=明記されていて合わない / null=記載なし
function matchesAttrs(title, attrs) {
  const sizeAttr = attrs.find((a) => a.type === 'size');
  if (!sizeAttr) return null;
  const t = normalizeQuery(title);
  const target = sizeAttr.value;
  // 範囲表記 24.5-28cm / 24.5〜28.0cm
  const ranges = [...t.matchAll(/(\d{2}(?:\.\d)?)\s*(?:cm)?\s*[-~〜～]\s*(\d{2}(?:\.\d)?)\s*cm/gi)];
  for (const m of ranges) if (target >= Number(m[1]) && target <= Number(m[2])) return true;
  const sizes = [...t.matchAll(/(\d{2}(?:\.\d)?)\s*cm/gi)].map((m) => Number(m[1]));
  if (!sizes.length && !ranges.length) return null;
  return sizes.includes(target) ? true : ranges.length || sizes.length ? false : null;
}

module.exports = { analyzeQuery, normalizeQuery, toKatakana, extractAttributes, splitByScript, relevance, matchesAttrs };
