// 共通ユーティリティ

const TRACKING_PARAMS = /^(utm_|gclid$|fbclid$|yclid$|mc_eid$|_ga$)/i;

/** URLを正規化（ハッシュ除去・トラッキングパラメータ除去・ホスト小文字化） */
export function normalizeUrl(raw, base) {
  let u;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  if (!u.pathname) u.pathname = '/';
  return u.toString();
}

/** www有無を同一サイトとして扱う */
export function siteKey(host) {
  return host.toLowerCase().replace(/^www\./, '');
}

export function isSameSite(url, rootHost) {
  try {
    return siteKey(new URL(url).hostname) === siteKey(rootHost);
  } catch {
    return false;
  }
}

/** 文字数（空白除去）。日本語SEOでは単語数より文字数が実態に近い */
export function charCount(text) {
  return (text || '').replace(/\s+/g, '').length;
}

export function isJapanese(text) {
  const s = (text || '').slice(0, 2000);
  const ja = (s.match(/[぀-ヿ一-鿿]/g) || []).length;
  return ja > s.replace(/\s/g, '').length * 0.15;
}

/** 表示幅（全角=2, 半角=1）。titleの切れ判定に使う */
export function displayWidth(text) {
  let w = 0;
  for (const ch of text || '') w += /[\u0000-ÿ｡-ﾟ]/.test(ch) ? 1 : 2;
  return w;
}

export function truncateWidth(text, maxWidth) {
  let w = 0;
  let out = '';
  for (const ch of text || '') {
    const cw = /[\u0000-ÿ｡-ﾟ]/.test(ch) ? 1 : 2;
    if (w + cw > maxWidth) return out.replace(/[、。,.\s・|｜-]+$/, '') + '…';
    w += cw;
    out += ch;
  }
  return out;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function csvRow(cols) {
  return cols.map((c) => {
    const s = String(c ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

export function slugify(url) {
  return url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'page';
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
