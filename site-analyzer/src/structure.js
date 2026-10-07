// サイトストラクチャー：URL階層ツリー / クリック深度 / 内部PageRank / 構造改善案

export function buildStructure(crawlResult) {
  const html = crawlResult.pages.filter((p) => p.title !== undefined && !p.isRedirect);
  const byUrl = new Map(html.map((p) => [p.url, p]));

  // ---- 内部PageRank（リンクジュースの近似。Ahrefs の URL Rating に相当する相対指標）----
  const urls = [...byUrl.keys()];
  const idx = new Map(urls.map((u, i) => [u, i]));
  const out = urls.map((u) => [...new Set(byUrl.get(u).links.filter((l) => l.internal && !l.nofollow && idx.has(l.url) && l.url !== u).map((l) => idx.get(l.url)))]);
  const N = urls.length || 1;
  let pr = new Array(N).fill(1 / N);
  for (let it = 0; it < 30; it++) {
    const next = new Array(N).fill(0.15 / N);
    let dangling = 0;
    for (let i = 0; i < N; i++) {
      if (!out[i]?.length) { dangling += pr[i]; continue; }
      const share = (0.85 * pr[i]) / out[i].length;
      for (const j of out[i]) next[j] += share;
    }
    for (let i = 0; i < N; i++) next[i] += (0.85 * dangling) / N;
    pr = next;
  }
  const max = Math.max(...pr, 1e-9);
  for (const u of urls) byUrl.get(u).internalRank = Math.round((pr[idx.get(u)] / max) * 100);

  // ---- URLパス階層ツリー ----
  const root = { name: new URL(crawlResult.home).host, path: '/', children: new Map(), page: null };
  for (const p of html) {
    const u = new URL(p.url);
    const segs = u.pathname.split('/').filter(Boolean);
    let node = root;
    let acc = '';
    for (const s of segs) {
      acc += '/' + s;
      if (!node.children.has(s)) node.children.set(s, { name: decodeURIComponentSafe(s), path: acc, children: new Map(), page: null });
      node = node.children.get(s);
    }
    if (u.search) {
      const key = u.search;
      node.children.set(key, { name: key, path: acc + key, children: new Map(), page: p });
    } else node.page = p;
  }
  const toJSON = (n) => ({
    name: n.name, path: n.path,
    url: n.page?.url || null, title: n.page?.title || '', status: n.page?.status ?? null,
    depth: n.page?.depth ?? null, inlinks: n.page?.inlinks ?? 0, rank: n.page?.internalRank ?? 0,
    children: [...n.children.values()].sort((a, b) => a.path.localeCompare(b.path)).map(toJSON),
  });
  const tree = toJSON(root);

  // ---- 深度分布 ----
  const depthDist = {};
  for (const p of html) {
    const d = p.depth == null ? '到達不可' : p.depth >= 5 ? '5+' : String(p.depth);
    depthDist[d] = (depthDist[d] || 0) + 1;
  }

  // ---- 構造上の改善提案 ----
  const proposals = [];
  const missingHubs = [];
  const walk = (n) => {
    if (n.path !== '/' && !n.url && n.children.length >= 2) missingHubs.push({ path: n.path, children: n.children.length });
    n.children.forEach(walk);
  };
  walk(tree);
  if (missingHubs.length) proposals.push({
    title: '階層の親ページ（ハブページ）が存在しないディレクトリがあります',
    detail: 'パンくず上の親階層にページがないと、カテゴリ全体の評価が集約されず、ユーザーもAIも全体像を把握できません。各ディレクトリに一覧＋概要のハブページを作成してください。',
    items: missingHubs.slice(0, 30).map((h) => `${h.path}/（配下 ${h.children} ページ）`),
  });
  const deep = html.filter((p) => p.depth != null && p.depth >= 4);
  if (deep.length) proposals.push({
    title: `トップから4クリック以上離れたページが ${deep.length} 件あります`,
    detail: '重要ページはトップから3クリック以内が目安です。グローバルナビ・カテゴリハブ・関連記事リンクで階層を浅くしてください。',
    items: deep.slice(0, 30).map((p) => `${p.url}（${p.depth}クリック）`),
  });
  const orphan = html.filter((p) => p.depth == null);
  if (orphan.length) proposals.push({
    title: `内部リンクから到達できないページ（孤立ページ）が ${orphan.length} 件あります`,
    detail: 'sitemap.xml には載っているが、どのページからもリンクされていません。関連するハブページや本文から内部リンクを張ってください。',
    items: orphan.slice(0, 30).map((p) => p.url),
  });
  const weakImportant = html.filter((p) => p.inlinks <= 1 && p.depth != null && p.depth > 0 && p.textLength > 1500);
  if (weakImportant.length) proposals.push({
    title: `情報量が多いのに内部リンクが1本以下のページが ${weakImportant.length} 件あります`,
    detail: 'しっかり書かれたページほど他ページから参照されるべきです。関連ページからアンカーテキスト付きでリンクしてください。',
    items: weakImportant.slice(0, 30).map((p) => `${p.url}（被リンク ${p.inlinks}）`),
  });
  const longUrls = html.filter((p) => decodeURIComponentSafe(new URL(p.url).pathname).length > 90 || /[A-Z_]|%[0-9A-F]{2}/.test(new URL(p.url).pathname));
  if (longUrls.length) proposals.push({
    title: `URL設計を見直したいページが ${longUrls.length} 件あります`,
    detail: 'URLは短く・小文字・ハイフン区切り・英数字が推奨です（日本語URLは共有時に長い%エンコードになります）。変更する場合は必ず301リダイレクトを設定してください。',
    items: longUrls.slice(0, 20).map((p) => p.url),
  });

  // ---- ページ種別の推定（ページリスト用）----
  for (const p of html) p.pageType = guessType(p, crawlResult.home);

  return { tree, depthDist, proposals, rankTop: html.slice().sort((a, b) => b.internalRank - a.internalRank).slice(0, 20).map((p) => ({ url: p.url, title: p.title, rank: p.internalRank, inlinks: p.inlinks })) };
}

function guessType(p, home) {
  const path = new URL(p.url).pathname.toLowerCase();
  if (p.url === home || path === '/' || /^\/index\.(html?|php)$/.test(path)) return 'トップ';
  const types = (p.jsonld || []).map((j) => j.type).join(',');
  if (/Product/.test(types) || /\/(products?|item|shop)\//.test(path)) return '商品';
  if (/Article|BlogPosting|NewsArticle/.test(types) || /\/(blog|news|column|articles?|posts?|topics|media)\//.test(path)) return '記事';
  if (/contact|inquiry|form|お問い合わせ/.test(path)) return 'お問い合わせ';
  if (/recruit|career|jobs?|採用/.test(path)) return '採用';
  if (/about|company|corporate|profile|会社/.test(path)) return '会社情報';
  if (/faq|qa|question/.test(path) || /FAQPage/.test(types)) return 'FAQ';
  if (/privacy|policy|terms|legal|sitemap/.test(path)) return '規約・その他';
  if (/(category|tag|archive)/.test(path) || (p.links || []).filter((l) => l.internal && !l.inNav).length > 30) return '一覧・カテゴリ';
  return 'サービス・一般';
}

function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}
