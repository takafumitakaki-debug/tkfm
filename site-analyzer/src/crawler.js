// サイトクローラー：robots.txt / sitemap.xml を読み、同一サイト内をBFSで巡回する
import { parseHtml } from './parse.js';
import { normalizeUrl, isSameSite, mapLimit } from './util.js';

export const USER_AGENT = 'Mozilla/5.0 (compatible; SiteAnalyzerBot/1.0; +https://github.com/)';

async function timedFetch(url, { method = 'GET', timeout = 15000, redirect = 'manual' } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const start = performance.now();
  try {
    const res = await fetch(url, { method, redirect, signal: ctrl.signal, headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en;q=0.8' } });
    return { res, ms: Math.round(performance.now() - start) };
  } finally {
    clearTimeout(t);
  }
}

/** リダイレクトを手動で追い、チェーンを記録する */
export async function fetchWithRedirects(url, opts = {}) {
  const chain = [];
  let current = url;
  let totalMs = 0;
  for (let i = 0; i < 8; i++) {
    const { res, ms } = await timedFetch(current, opts);
    totalMs += ms;
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      chain.push({ url: current, status: res.status });
      await res.body?.cancel().catch(() => {});
      current = normalizeUrl(res.headers.get('location'), current);
      if (!current) break;
      continue;
    }
    return { res, finalUrl: current, chain, ms: totalMs };
  }
  throw new Error('リダイレクトが多すぎます（ループの可能性）');
}

// ---------- robots.txt ----------
export function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasUA = false;
  const sitemaps = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasUA || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasUA = true;
    } else {
      lastWasUA = false;
      if (key === 'sitemap') sitemaps.push(val);
      else if ((key === 'allow' || key === 'disallow') && cur) cur.rules.push({ allow: key === 'allow', path: val });
    }
  }
  return { groups, sitemaps };
}

function groupFor(robots, agent) {
  const a = agent.toLowerCase();
  return robots.groups.find((g) => g.agents.some((x) => x !== '*' && a.includes(x))) || robots.groups.find((g) => g.agents.includes('*'));
}

function ruleMatch(path, rulePath) {
  if (!rulePath) return -1;
  const re = new RegExp('^' + rulePath.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  return re.test(path) ? rulePath.length : -1;
}

export function isAllowed(robots, agent, url) {
  if (!robots) return true;
  const g = groupFor(robots, agent);
  if (!g) return true;
  const u = new URL(url);
  const path = u.pathname + u.search;
  let best = { len: -1, allow: true };
  for (const r of g.rules) {
    const len = ruleMatch(path, r.path);
    if (len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best.len < 0 ? true : best.allow;
}

/** 主要AIクローラーのアクセス可否 */
export const AI_BOTS = [
  { ua: 'GPTBot', owner: 'OpenAI（学習）' },
  { ua: 'OAI-SearchBot', owner: 'OpenAI（ChatGPT検索）' },
  { ua: 'ChatGPT-User', owner: 'OpenAI（ユーザー操作）' },
  { ua: 'ClaudeBot', owner: 'Anthropic（学習）' },
  { ua: 'Claude-SearchBot', owner: 'Anthropic（検索）' },
  { ua: 'Claude-User', owner: 'Anthropic（ユーザー操作）' },
  { ua: 'PerplexityBot', owner: 'Perplexity' },
  { ua: 'Google-Extended', owner: 'Google（Gemini学習）' },
  { ua: 'Googlebot', owner: 'Google検索 / AI Overviews' },
  { ua: 'Bingbot', owner: 'Bing / Copilot' },
  { ua: 'Applebot-Extended', owner: 'Apple（AI学習）' },
  { ua: 'CCBot', owner: 'Common Crawl' },
];

// ---------- sitemap ----------
async function readSitemaps(urls, rootHost, limit = 5000) {
  const found = new Set();
  const seen = new Set();
  const queue = [...urls];
  const checked = [];
  while (queue.length && seen.size < 30 && found.size < limit) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      const { res } = await fetchWithRedirects(sm, { timeout: 15000 });
      if (!res.ok) { checked.push({ url: sm, status: res.status }); continue; }
      const xml = await res.text();
      checked.push({ url: sm, status: res.status });
      const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
      if (/<sitemapindex/i.test(xml)) queue.push(...locs);
      else for (const l of locs) {
        const n = normalizeUrl(l);
        if (n && isSameSite(n, rootHost)) found.add(n);
      }
    } catch (e) {
      checked.push({ url: sm, status: 0, error: e.message });
    }
  }
  return { urls: [...found], checked };
}

// ---------- crawl ----------
export async function crawl(startUrl, { maxPages = 200, concurrency = 4, respectRobots = true, checkExternal = true, onProgress = () => {} } = {}) {
  const start = normalizeUrl(startUrl);
  if (!start) throw new Error('URLが不正です: ' + startUrl);

  // 起点（リダイレクト後のURLをサイトの正とする）
  const first = await fetchWithRedirects(start);
  await first.res.body?.cancel().catch(() => {});
  const origin = new URL(first.finalUrl).origin;
  const rootHost = new URL(first.finalUrl).hostname;

  // robots.txt
  let robotsTxt = null;
  let robots = null;
  try {
    const { res } = await fetchWithRedirects(origin + '/robots.txt');
    if (res.ok && !/html/i.test(res.headers.get('content-type') || '')) {
      robotsTxt = await res.text();
      robots = parseRobots(robotsTxt);
    } else await res.body?.cancel().catch(() => {});
  } catch { /* robots.txtなし */ }

  // llms.txt
  let llmsTxt = null;
  try {
    const { res } = await fetchWithRedirects(origin + '/llms.txt');
    const ct = res.headers.get('content-type') || '';
    if (res.ok && !/html/i.test(ct)) llmsTxt = (await res.text()).slice(0, 50000);
    else await res.body?.cancel().catch(() => {});
  } catch { /* なし */ }

  onProgress({ phase: 'sitemap', message: 'sitemap.xml を確認中' });
  const smCandidates = robots?.sitemaps?.length ? robots.sitemaps : [origin + '/sitemap.xml', origin + '/sitemap_index.xml'];
  const sitemap = await readSitemaps(smCandidates, rootHost);
  const sitemapSet = new Set(sitemap.urls);

  const pages = new Map(); // url -> page
  const depthOf = new Map([[first.finalUrl, 0]]);
  const queue = [first.finalUrl];
  const enqueued = new Set([first.finalUrl, start]);
  if (start !== first.finalUrl) {
    pages.set(start, { url: start, status: first.chain[0]?.status || 301, redirectTo: first.finalUrl, chain: first.chain, isRedirect: true, depth: 0 });
  }
  for (const u of sitemap.urls) if (!enqueued.has(u)) { enqueued.add(u); queue.push(u); depthOf.set(u, null); }
  const linkSources = new Map(); // target -> Set(source)
  const anchorTexts = new Map(); // target -> [text]
  const externalLinks = new Map(); // url -> Set(source)
  const blockedByRobots = [];

  let processed = 0;
  const processOne = async (url) => {
    if (respectRobots && robots && !isAllowed(robots, 'SiteAnalyzerBot', url)) {
      blockedByRobots.push(url);
      return;
    }
    const page = { url, depth: depthOf.get(url) ?? null, inSitemap: sitemapSet.has(url) };
    try {
      const r = await fetchWithRedirects(url);
      page.status = r.res.status;
      page.ms = r.ms;
      page.chain = r.chain;
      page.contentType = r.res.headers.get('content-type') || '';
      page.xRobots = r.res.headers.get('x-robots-tag') || '';
      page.lastModified = r.res.headers.get('last-modified') || '';
      page.cacheControl = r.res.headers.get('cache-control') || '';
      page.contentEncoding = r.res.headers.get('content-encoding') || '';
      page.hsts = !!r.res.headers.get('strict-transport-security');
      if (r.chain.length) {
        page.isRedirect = true;
        page.redirectTo = r.finalUrl;
        page.status = r.chain[0].status;
        page.finalStatus = r.res.status;
        await r.res.body?.cancel().catch(() => {});
        if (isSameSite(r.finalUrl, rootHost) && !enqueued.has(r.finalUrl)) {
          enqueued.add(r.finalUrl);
          depthOf.set(r.finalUrl, page.depth);
          queue.push(r.finalUrl);
        }
      } else if (/html/i.test(page.contentType) && r.res.ok) {
        const html = await r.res.text();
        page.bytes = Buffer.byteLength(html);
        Object.assign(page, parseHtml(html, url, rootHost));
        for (const l of page.links) {
          if (l.internal) {
            if (!linkSources.has(l.url)) linkSources.set(l.url, new Set());
            linkSources.get(l.url).add(url);
            if (!anchorTexts.has(l.url)) anchorTexts.set(l.url, []);
            anchorTexts.get(l.url).push(l.text);
            if (!enqueued.has(l.url) && enqueued.size < maxPages * 3) {
              enqueued.add(l.url);
              depthOf.set(l.url, (page.depth ?? 0) + 1);
              queue.push(l.url);
            } else if (depthOf.get(l.url) == null && page.depth != null) {
              depthOf.set(l.url, page.depth + 1);
            }
          } else {
            if (!externalLinks.has(l.url)) externalLinks.set(l.url, new Set());
            externalLinks.get(l.url).add(url);
          }
        }
      } else {
        await r.res.body?.cancel().catch(() => {});
      }
    } catch (e) {
      page.status = 0;
      page.error = e.name === 'AbortError' ? 'タイムアウト' : e.message;
    }
    pages.set(url, page);
    processed++;
    onProgress({ phase: 'crawl', message: `クロール中 ${processed} ページ`, done: processed, total: Math.min(maxPages, queue.length + processed) });
  };

  // BFS: リンク由来のURLを優先（深さ順）にしつつ並列処理
  while (queue.length && pages.size < maxPages) {
    queue.sort((a, b) => (depthOf.get(a) ?? 99) - (depthOf.get(b) ?? 99));
    const batch = queue.splice(0, Math.min(concurrency, maxPages - pages.size));
    await Promise.all(batch.map(processOne));
  }
  const notCrawled = queue.length;

  // 深さを最終確定（リンクグラフでBFS）
  const home = first.finalUrl;
  const dist = new Map([[home, 0]]);
  const bfs = [home];
  while (bfs.length) {
    const u = bfs.shift();
    const p = pages.get(u);
    const targets = p?.links ? p.links.filter((l) => l.internal).map((l) => l.url) : p?.redirectTo ? [p.redirectTo] : [];
    for (const t of targets) if (!dist.has(t)) { dist.set(t, dist.get(u) + 1); bfs.push(t); }
  }
  for (const p of pages.values()) {
    p.depth = dist.has(p.url) ? dist.get(p.url) : null;
    p.inlinks = linkSources.has(p.url) ? [...linkSources.get(p.url)].filter((s) => s !== p.url).length : 0;
    p.inlinkSources = linkSources.has(p.url) ? [...linkSources.get(p.url)].filter((s) => s !== p.url).slice(0, 50) : [];
    p.anchors = anchorTexts.get(p.url)?.filter(Boolean).slice(0, 50) || [];
  }

  // 未クロールだがリンクされているURLのステータス確認（リンク切れ検出用、上限あり）
  const uncheckedInternal = [...linkSources.keys()].filter((u) => !pages.has(u)).slice(0, 300);
  const linkStatus = new Map();
  onProgress({ phase: 'links', message: 'リンク切れをチェック中' });
  await mapLimit(uncheckedInternal, concurrency * 2, async (u) => linkStatus.set(u, await headStatus(u)));
  if (checkExternal) {
    const ext = [...externalLinks.keys()].slice(0, 300);
    await mapLimit(ext, concurrency * 2, async (u) => linkStatus.set(u, await headStatus(u)));
  }

  return {
    startUrl: start, home, origin, rootHost, crawledAt: new Date().toISOString(),
    pages: [...pages.values()],
    robotsTxt, robots, llmsTxt, sitemap: { ...sitemap, count: sitemap.urls.length },
    blockedByRobots, notCrawled, maxPages,
    externalLinks: [...externalLinks.entries()].map(([url, s]) => ({ url, sources: [...s].slice(0, 20), status: linkStatus.get(url) ?? null })),
    uncheckedInternal: uncheckedInternal.map((url) => ({ url, status: linkStatus.get(url) ?? null, sources: [...(linkSources.get(url) || [])].slice(0, 20) })),
  };
}

async function headStatus(url) {
  try {
    let r = await fetchWithRedirects(url, { method: 'HEAD', timeout: 10000 });
    if (r.res.status === 405 || r.res.status === 403 || r.res.status === 501) {
      r = await fetchWithRedirects(url, { method: 'GET', timeout: 10000 });
      await r.res.body?.cancel().catch(() => {});
    }
    return r.res.status;
  } catch {
    return 0;
  }
}
