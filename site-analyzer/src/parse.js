// HTMLから SEO / 構造 / チャンク解析に必要な情報を抽出する
import * as cheerio from 'cheerio';
import { normalizeUrl, isSameSite, charCount } from './util.js';

const BLOCK_TAGS = new Set(['p', 'li', 'td', 'th', 'dd', 'dt', 'blockquote', 'pre', 'figcaption', 'summary']);

export function parseHtml(html, pageUrl, rootHost) {
  const $ = cheerio.load(html);
  const head = (sel, attr = 'content') => ($(sel).first().attr(attr) || '').trim();

  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const titleCount = $('title').length;
  const metaDescription = head('meta[name="description" i]');
  const metaDescriptionCount = $('meta[name="description" i]').length;
  const canonicalRaw = head('link[rel="canonical" i]', 'href');
  const canonical = canonicalRaw ? normalizeUrl(canonicalRaw, pageUrl) : '';
  const robotsMeta = head('meta[name="robots" i]').toLowerCase();
  const viewport = head('meta[name="viewport" i]');
  const lang = ($('html').attr('lang') || '').trim();
  const charset = $('meta[charset]').attr('charset') || '';

  const og = {};
  $('meta[property^="og:"]').each((_, el) => { og[$(el).attr('property').slice(3)] = $(el).attr('content') || ''; });
  const twitter = {};
  $('meta[name^="twitter:"]').each((_, el) => { twitter[$(el).attr('name').slice(8)] = $(el).attr('content') || ''; });

  const hreflang = [];
  $('link[rel="alternate" i][hreflang]').each((_, el) => hreflang.push({ lang: $(el).attr('hreflang'), href: $(el).attr('href') }));

  // 構造化データ
  const jsonld = [];
  const jsonldErrors = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const data = JSON.parse(raw);
      const collect = (d) => {
        if (Array.isArray(d)) return d.forEach(collect);
        if (d && typeof d === 'object') {
          if (d['@graph']) collect(d['@graph']);
          if (d['@type']) jsonld.push({ type: [].concat(d['@type']).join(','), data: d });
        }
      };
      collect(data);
    } catch (e) {
      jsonldErrors.push(String(e.message).slice(0, 120));
    }
  });
  const microdataTypes = [...new Set($('[itemtype]').map((_, el) => ($(el).attr('itemtype') || '').split('/').pop()).get())];

  // 見出し（文書順）
  const headings = [];
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const imgAlt = $(el).find('img[alt]').map((_, i) => $(i).attr('alt')).get().join(' ').trim();
    headings.push({ level: Number(el.tagName[1]), text: text || imgAlt, empty: !text && !imgAlt });
  });

  // リンク
  const links = [];
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) return;
    const abs = normalizeUrl(href, pageUrl);
    if (!abs) return;
    const rel = ($(el).attr('rel') || '').toLowerCase();
    const text = $(el).text().replace(/\s+/g, ' ').trim() || ($(el).find('img').attr('alt') || '').trim();
    const inNav = $(el).closest('nav,header,footer').length > 0;
    links.push({ url: abs, text: text.slice(0, 120), internal: isSameSite(abs, rootHost), nofollow: /nofollow|ugc|sponsored/.test(rel), inNav });
  });

  // 画像
  const images = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    images.push({
      src: src ? normalizeUrl(src, pageUrl) || src : '',
      alt: $(el).attr('alt'),
      hasAlt: $(el).attr('alt') !== undefined,
      width: $(el).attr('width') || '',
      height: $(el).attr('height') || '',
      loading: $(el).attr('loading') || '',
    });
  });

  const scripts = $('script[src]').length;
  const stylesheets = $('link[rel="stylesheet" i]').length;
  const inlineScriptBytes = $('script:not([src])').text().length;
  const hasForm = $('form').length > 0;
  const iframes = $('iframe').length;

  // 本文領域
  $('script,style,noscript,template,svg').remove();
  let main = $('main').first();
  if (!main.length) main = $('article').first();
  if (!main.length) main = $('[role="main"]').first();
  const mainDetected = main.length > 0;
  if (!main.length) main = $('body');
  const mainClone = cheerio.load(main.html() || '');
  mainClone('nav,header,footer,aside,[role="navigation"],[aria-hidden="true"]').remove();
  const bodyText = mainClone.root().text().replace(/\s+/g, ' ').trim();
  const fullText = $('body').text().replace(/\s+/g, ' ').trim();

  const chunks = buildChunks(mainClone);
  const faqLike = headings.filter((h) => /[?？]$|とは$|ですか|ますか|方法|how|what|why/i.test(h.text)).length;
  const dateHints = {
    published: head('meta[property="article:published_time"]') || jsonld.map((j) => j.data.datePublished).find(Boolean) || ($('time[datetime]').first().attr('datetime') || ''),
    modified: head('meta[property="article:modified_time"]') || jsonld.map((j) => j.data.dateModified).find(Boolean) || '',
  };
  const author = head('meta[name="author" i]') || jsonld.map((j) => (j.data.author && (j.data.author.name || j.data.author)) || '').find((a) => typeof a === 'string' && a) || '';

  return {
    title, titleCount, metaDescription, metaDescriptionCount, canonical, robotsMeta, viewport, lang, charset,
    og, twitter, hreflang, jsonld: jsonld.map((j) => ({ type: j.type, data: j.data })), jsonldErrors, microdataTypes,
    headings, links, images, scripts, stylesheets, inlineScriptBytes, hasForm, iframes,
    mainDetected, text: bodyText.slice(0, 20000), textLength: charCount(bodyText), fullTextLength: charCount(fullText),
    textRatio: html.length ? +(charCount(fullText) / html.length).toFixed(3) : 0,
    chunks, faqLike, dateHints, author,
  };
}

/**
 * 見出し(h1〜h4)単位で本文をチャンク化する。
 * AI検索（RAG）は見出し区切り・段落区切りでコンテンツを分割して引用するため、
 * 「1チャンク = 1トピック・単独で意味が通る」状態かを評価する土台にする。
 */
function buildChunks($) {
  const chunks = [];
  let cur = { heading: '(見出しなし・冒頭)', level: 0, parts: [], lists: 0, tables: 0 };
  const push = () => {
    const text = cur.parts.join('\n').trim();
    if (text || cur.level) chunks.push({ heading: cur.heading, level: cur.level, text, chars: charCount(text), lists: cur.lists, tables: cur.tables, paragraphs: cur.parts.length });
  };
  const walk = (node) => {
    for (const el of node.children || []) {
      if (el.type === 'text') {
        const t = (el.data || '').replace(/\s+/g, ' ').trim();
        if (t && el.parent && !BLOCK_TAGS.has(el.parent.name) && t.length > 1) cur.parts.push(t);
        continue;
      }
      if (el.type !== 'tag') continue;
      const tag = el.name;
      if (/^h[1-4]$/.test(tag)) {
        push();
        cur = { heading: $(el).text().replace(/\s+/g, ' ').trim() || '(空の見出し)', level: Number(tag[1]), parts: [], lists: 0, tables: 0 };
        continue;
      }
      if (/^h[56]$/.test(tag)) { cur.parts.push($(el).text().trim()); continue; }
      if (tag === 'ul' || tag === 'ol' || tag === 'dl') cur.lists++;
      if (tag === 'table') cur.tables++;
      if (BLOCK_TAGS.has(tag)) {
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        if (t) cur.parts.push(tag === 'li' ? `・${t}` : t);
        if (tag !== 'li' && tag !== 'td' && tag !== 'th' && tag !== 'dd' && tag !== 'dt') continue;
        continue;
      }
      walk(el);
    }
  };
  walk($.root()[0]);
  push();
  return chunks.filter((c) => c.text || c.level);
}
