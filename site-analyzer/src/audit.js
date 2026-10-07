// サイト監査：Ahrefs Site Audit 相当の課題検出。各課題に「なぜ問題か」「改善方法」を付ける
import { displayWidth, isJapanese } from './util.js';

const SEV_WEIGHT = { error: 10, warning: 4, notice: 1 };

export function runAudit(crawlResult, structure, keywords, duplicates) {
  const all = crawlResult.pages;
  const html = all.filter((p) => p.title !== undefined && !p.isRedirect);
  const issues = [];
  const add = (id, severity, category, title, why, how, urls) => {
    const list = [...new Set(urls.filter(Boolean))];
    if (list.length) issues.push({ id, severity, category, title, why, how, urls: list.slice(0, 500), count: list.length });
  };
  const indexable = (p) => p.status === 200 && !/noindex/.test(`${p.robotsMeta} ${p.xRobots}`) && (!p.canonical || p.canonical === p.url);

  // ---------- ステータス・クロール ----------
  add('4xx', 'error', '内部ページ', '4xx エラーのページ', 'リンク先が存在せずユーザー・クローラーが行き止まりになります。', 'ページを復旧するか、適切なページへ301リダイレクトし、リンク元の内部リンクを修正してください。',
    [...all.filter((p) => p.status >= 400 && p.status < 500).map((p) => p.url), ...crawlResult.uncheckedInternal.filter((x) => x.status >= 400 && x.status < 500).map((x) => x.url)]);
  add('5xx', 'error', '内部ページ', '5xx サーバーエラーのページ', 'サーバーエラーが続くとインデックスから削除されます。', 'サーバーログで原因を特定し修正してください。', all.filter((p) => p.status >= 500).map((p) => p.url));
  add('timeout', 'error', '内部ページ', '取得できなかったページ（タイムアウト等）', '応答がないページは評価されません。', 'サーバー応答速度・WAF設定を確認してください。', all.filter((p) => p.status === 0).map((p) => p.url));
  add('redirect-chain', 'warning', 'リダイレクト', 'リダイレクトチェーン（2回以上の転送）', '転送のたびに評価が目減りし、表示も遅くなります。', '最終URLへ直接1回で301リダイレクトするよう設定し、内部リンクも最終URLに書き換えてください。', all.filter((p) => (p.chain || []).length >= 2).map((p) => p.url));
  add('redirect-302', 'warning', 'リダイレクト', '一時的リダイレクト（302/307）', '恒久的な移転なのに302だと評価が引き継がれにくくなります。', '恒久的な移転なら301（または308）に変更してください。', all.filter((p) => (p.chain || []).some((c) => c.status === 302 || c.status === 307)).map((p) => p.url));
  const linkedRedirects = all.filter((p) => p.isRedirect && p.inlinks > 0);
  add('link-to-redirect', 'notice', '内部リンク', 'リダイレクトするURLへの内部リンク', '無駄な転送が発生します。', 'リンク先を転送後の最終URLに直接書き換えてください。', linkedRedirects.map((p) => p.url));
  add('http', 'error', 'セキュリティ', 'HTTPS化されていないページ', 'ブラウザに「保護されていない通信」と表示され、ランキングにも不利です。', 'SSL証明書を導入し、http→httpsへ301リダイレクトしてください。', html.filter((p) => p.url.startsWith('http:') && !/^http:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(p.url)).map((p) => p.url));
  add('mixed', 'warning', 'セキュリティ', 'HTTPSページ内のHTTPリソース（混在コンテンツ）', '画像等がブロックされたり警告が出ます。', '画像・スクリプトのURLを https:// に変更してください。', html.filter((p) => p.url.startsWith('https:') && (p.images || []).some((i) => /^http:/.test(i.src))).map((p) => p.url));
  add('robots-blocked', 'notice', 'クロール', 'robots.txtでブロックされているURL', 'ブロックしたページは検索・AIに読まれません（意図通りか確認）。', '公開したいページなら robots.txt の Disallow を見直してください。', crawlResult.blockedByRobots);

  // ---------- インデックス制御 ----------
  add('noindex', 'notice', 'インデックス', 'noindex のページ', '検索結果・AI検索に表示されません。', '意図したもの以外は noindex を外してください。', html.filter((p) => /noindex/.test(`${p.robotsMeta} ${p.xRobots}`)).map((p) => p.url));
  add('canonical-other', 'notice', 'インデックス', 'canonical が別URLを指しているページ', 'このURLは評価対象から外れます。', '正規化の意図が正しいか確認してください。', html.filter((p) => p.canonical && p.canonical !== p.url).map((p) => p.url));
  add('canonical-missing', 'notice', 'インデックス', 'canonical タグがないページ', 'パラメータ付きURLなどの重複を自分で正規化できません。', '各ページに自己参照の <link rel="canonical" href="（そのページのURL）"> を設置してください。', html.filter((p) => !p.canonical && p.status === 200).map((p) => p.url));
  const brokenCanonical = html.filter((p) => p.canonical && p.canonical !== p.url && all.some((q) => q.url === p.canonical && (q.status >= 400 || q.isRedirect)));
  add('canonical-broken', 'error', 'インデックス', 'canonical 先がエラー/リダイレクト', '正規URLの指定が無効になります。', 'canonical は200を返す最終URLを指定してください。', brokenCanonical.map((p) => p.url));
  add('not-in-sitemap', 'notice', 'インデックス', 'sitemap.xml に含まれていないインデックス対象ページ', '新規・更新ページの発見が遅れます。', '生成ファイルの sitemap.xml（全インデックス対象ページを収録）に差し替えてください。', crawlResult.sitemap.count ? html.filter((p) => indexable(p) && !p.inSitemap).map((p) => p.url) : []);
  add('sitemap-non200', 'warning', 'インデックス', 'sitemap.xml に含まれる非200/noindexのURL', 'サイトマップの信頼度が下がります。', 'サイトマップには200を返すインデックス対象URLのみを記載してください。', all.filter((p) => p.inSitemap && (p.status !== 200 || p.isRedirect || /noindex/.test(`${p.robotsMeta} ${p.xRobots}`))).map((p) => p.url));

  // ---------- title / description ----------
  const ok = html.filter((p) => p.status === 200);
  add('title-missing', 'error', 'タイトル', 'title タグがない・空', '検索結果の見出しになる最重要要素です。', '「主要キーワード＋ページ固有の価値｜サイト名」で全角30字前後のtitleを設定してください（生成ファイルに案あり）。', ok.filter((p) => !p.title).map((p) => p.url));
  add('title-long', 'warning', 'タイトル', 'title が長すぎる（全角32字超）', '検索結果で末尾が切れ、重要語が見えなくなります。', '重要キーワードを前半に置き、全角30字前後に短縮してください。', ok.filter((p) => p.title && displayWidth(p.title) > 64).map((p) => p.url));
  add('title-short', 'notice', 'タイトル', 'title が短すぎる（全角10字未満）', '内容が伝わらずクリック率が下がります。', 'ページの主題と差別化要素を含めて全角25〜32字にしてください。', ok.filter((p) => p.title && displayWidth(p.title) < 20).map((p) => p.url));
  add('title-multiple', 'warning', 'タイトル', 'title タグが複数ある', 'どれが採用されるか不定になります。', 'title タグを1つにしてください。', ok.filter((p) => p.titleCount > 1).map((p) => p.url));
  const dupTitle = groupDup(ok.filter((p) => p.title), (p) => p.title);
  add('title-duplicate', 'warning', 'タイトル', '重複している title', '検索エンジンがページを区別できず、評価が分散します。', '各ページ固有の内容（地域・対象・商品名など）を含めて書き分けてください。', dupTitle.flat());
  add('desc-missing', 'warning', 'メタディスクリプション', 'meta description がない', '検索結果の説明文が自動抽出になり、クリック率が下がりがちです。', 'ページの要点と行動喚起を全角80〜120字で記述してください（生成ファイルに案あり）。', ok.filter((p) => !p.metaDescription).map((p) => p.url));
  add('desc-long', 'notice', 'メタディスクリプション', 'meta description が長すぎる（全角120字超）', '後半が省略されます。', '重要な情報を前半に置き、全角120字以内にしてください。', ok.filter((p) => p.metaDescription && displayWidth(p.metaDescription) > 240).map((p) => p.url));
  add('desc-short', 'notice', 'メタディスクリプション', 'meta description が短すぎる（全角35字未満）', '訴求が不足します。', '全角80〜120字で内容と利点を具体的に書いてください。', ok.filter((p) => p.metaDescription && displayWidth(p.metaDescription) < 70).map((p) => p.url));
  add('desc-duplicate', 'notice', 'メタディスクリプション', '重複している meta description', 'ページごとの差別化ができていません。', 'ページ固有の要約に書き換えてください。', groupDup(ok.filter((p) => p.metaDescription), (p) => p.metaDescription).flat());

  // ---------- 見出し ----------
  add('h1-missing', 'error', '見出し', 'h1 がない', 'ページの主題が伝わりません。', 'ページの主題を表す h1 を1つ設置してください（ロゴ画像のみのh1は不可）。', ok.filter((p) => !(p.headings || []).some((h) => h.level === 1 && !h.empty)).map((p) => p.url));
  add('h1-multiple', 'warning', '見出し', 'h1 が複数ある', '主題がぼやけます。', 'h1は1ページ1つにし、他はh2以下にしてください。', ok.filter((p) => (p.headings || []).filter((h) => h.level === 1).length > 1).map((p) => p.url));
  add('h-skip', 'notice', '見出し', '見出しレベルの飛び（例：h2→h4）', '文書構造が崩れ、AIや支援技術が階層を誤解します。', '見出しは h1→h2→h3 の順に階層を下げてください（見た目はCSSで調整）。', ok.filter((p) => hasSkip(p.headings || [])).map((p) => p.url));
  add('h-empty', 'warning', '見出し', '空の見出しタグ', '意味のない見出しは構造を乱します。', '見出しにテキストを入れるか、装飾目的ならdiv等に変更してください。', ok.filter((p) => (p.headings || []).some((h) => h.empty)).map((p) => p.url));
  add('h2-none', 'notice', '見出し', 'h2 がない（本文が構造化されていない）', 'セクション分けがないと、検索・AIが内容を部分的に引用できません。', '本文をトピックごとに h2 で区切ってください。', ok.filter((p) => p.textLength > 800 && !(p.headings || []).some((h) => h.level === 2)).map((p) => p.url));
  add('h1-title-mismatch', 'notice', '見出し', 'title と h1 の主題が一致していない', 'ページのテーマが曖昧に伝わります。', 'title と h1 に同じ主要キーワードを含めてください（完全一致である必要はありません）。', ok.filter((p) => {
    const h1 = (p.headings || []).find((h) => h.level === 1)?.text;
    const kw = keywords.pageKeywords[p.url]?.[0]?.term;
    return h1 && p.title && kw && !(p.title.includes(kw) && h1.includes(kw)) && !p.title.includes(h1.slice(0, 6));
  }).map((p) => p.url));

  // ---------- コンテンツ ----------
  add('thin', 'warning', 'コンテンツ', 'コンテンツが薄い（本文300字未満）', '検索意図を満たせず、評価・AI引用の対象になりにくいです。', '対象ユーザーの疑問（何か・なぜ・どうやって・費用・事例）に答える内容を加筆するか、関連ページと統合してください。', ok.filter((p) => p.textLength < 300 && !['お問い合わせ', '規約・その他'].includes(p.pageType)).map((p) => p.url));
  add('duplicate-content', 'warning', 'コンテンツ', '重複・酷似コンテンツ', '同じ内容のページは評価が分散し、どちらも上位表示されにくくなります。', '統合して301リダイレクトするか、canonicalで正規ページを指定、または内容を書き分けてください。', duplicates.flatMap((d) => [d.a, d.b]));
  add('cannibal', 'notice', 'コンテンツ', 'キーワードカニバリゼーションの可能性', '同じキーワードを複数ページが狙い、互いに順位を奪い合います。', 'キーワードごとに担当ページを1つ決め、他ページはそのページへ内部リンクで送るか、別の切り口に変更してください。', keywords.cannibal.filter((c) => c.urls.length <= 6).flatMap((c) => c.urls));
  add('lang-missing', 'notice', 'コンテンツ', 'html の lang 属性がない', '言語判定・読み上げ・AIの言語認識に影響します。', `<html lang="${isJapanese(ok[0]?.text) ? 'ja' : 'en'}"> を指定してください。`, ok.filter((p) => !p.lang).map((p) => p.url));
  add('low-text-ratio', 'notice', 'コンテンツ', 'テキスト比率が低い（HTMLのほとんどがコード）', 'ページが重く、本文の比重が小さく見えます。', '不要なインラインスクリプト・CSSを外部化し、本文を充実させてください。', ok.filter((p) => p.textRatio < 0.05 && p.bytes > 30000).map((p) => p.url));

  // ---------- 画像 ----------
  add('img-alt', 'warning', '画像', 'alt 属性がない画像があるページ', '画像の内容が検索エンジン・AI・視覚障害者に伝わりません。', '意味のある画像には内容を説明する alt を、装飾画像には alt="" を設定してください。', ok.filter((p) => (p.images || []).some((i) => !i.hasAlt)).map((p) => p.url));
  add('img-size', 'notice', '画像', 'width/height 指定のない画像（CLSの原因）', '読み込み時にレイアウトがずれ、Core Web Vitals（CLS）が悪化します。', 'img に width と height（または CSS aspect-ratio）を指定してください。', ok.filter((p) => (p.images || []).filter((i) => !i.width || !i.height).length >= 3).map((p) => p.url));
  add('img-lazy', 'notice', '画像', '遅延読み込みしていない画像が多い', '初期表示が遅くなります。', 'ファーストビュー以外の画像に loading="lazy" を付けてください。', ok.filter((p) => (p.images || []).length >= 6 && (p.images || []).filter((i) => i.loading === 'lazy').length === 0).map((p) => p.url));

  // ---------- 内部リンク ----------
  add('orphan', 'warning', '内部リンク', '孤立ページ（内部リンクから到達不可）', 'クローラーが発見しにくく、評価も渡りません。', '関連ページ・カテゴリページから内部リンクを張ってください。', html.filter((p) => p.depth == null).map((p) => p.url));
  add('single-inlink', 'notice', '内部リンク', '被内部リンクが1本だけのページ', '重要度が低いと判断されやすくなります。', '関連する複数ページから文脈のあるアンカーテキストでリンクしてください。', ok.filter((p) => p.inlinks === 1 && p.depth > 0).map((p) => p.url));
  add('deep', 'notice', '内部リンク', 'クリック深度が4以上', 'トップから遠いページはクロール頻度・評価が下がります。', 'ナビゲーションやハブページから直接リンクして3クリック以内にしてください。', html.filter((p) => p.depth >= 4).map((p) => p.url));
  add('no-outlinks', 'notice', '内部リンク', '内部リンクを1本も持たないページ', '回遊が止まり、評価の流れも途切れます（行き止まりページ）。', '関連ページ・次のアクションへのリンクを設置してください。', ok.filter((p) => !(p.links || []).some((l) => l.internal)).map((p) => p.url));
  const genericAnchor = /^(こちら|ここ|詳しくはこちら|詳細|詳細はこちら|もっと見る|続きを読む|click here|here|more|read more|link)$/i;
  add('anchor-generic', 'notice', '内部リンク', '「こちら」等の意味のないアンカーテキスト', 'リンク先の内容が検索エンジンに伝わりません。', 'アンカーテキストをリンク先の内容を表す語句（例：「沖縄の物流サービス一覧」）にしてください。', ok.filter((p) => (p.links || []).some((l) => l.internal && genericAnchor.test(l.text))).map((p) => p.url));
  add('nofollow-internal', 'notice', '内部リンク', '内部リンクに nofollow', 'サイト内の評価の流れを自ら止めています。', '内部リンクの rel="nofollow" を外してください。', ok.filter((p) => (p.links || []).some((l) => l.internal && l.nofollow)).map((p) => p.url));
  const brokenInt = crawlResult.uncheckedInternal.filter((x) => x.status >= 400 || x.status === 0);
  add('broken-internal-link', 'error', '内部リンク', '内部リンク切れを含むページ', 'リンク先が404等になっています。', 'リンク先URLを修正するか削除してください（課題詳細のリンク切れ一覧参照）。', [...brokenInt.flatMap((x) => x.sources), ...html.filter((p) => (p.links || []).some((l) => l.internal && all.some((q) => q.url === l.url && q.status >= 400))).map((p) => p.url)]);
  const brokenExt = crawlResult.externalLinks.filter((x) => x.status != null && (x.status >= 400 || x.status === 0) && x.status !== 403 && x.status !== 429 && x.status !== 999);
  add('broken-external-link', 'warning', '外部リンク', '外部リンク切れを含むページ', '利用者体験と信頼性を損ないます。', 'リンク先を最新のURLに更新するか削除してください。', brokenExt.flatMap((x) => x.sources));

  // ---------- パフォーマンス ----------
  add('slow', 'warning', 'パフォーマンス', 'サーバー応答が遅い（1.5秒超）', '表示速度はUXとランキングに影響します。', 'キャッシュ（CDN・ページキャッシュ）導入、サーバー処理・DBクエリの最適化を行ってください。', ok.filter((p) => p.ms > 1500).map((p) => p.url));
  add('heavy', 'notice', 'パフォーマンス', 'HTMLが重い（300KB超）', 'モバイルで表示が遅くなります。', '不要なインラインコード・巨大な埋め込みデータを削減してください。', ok.filter((p) => p.bytes > 300 * 1024).map((p) => p.url));
  add('many-scripts', 'notice', 'パフォーマンス', '外部スクリプトが多い（20本超）', 'レンダリングをブロックしINP/LCPが悪化します。', '不要なタグを削除し、defer/async を付与、タグマネージャーで整理してください。', ok.filter((p) => p.scripts > 20).map((p) => p.url));
  add('no-compression', 'notice', 'パフォーマンス', 'gzip/brotli 圧縮されていない', '転送量が増え表示が遅くなります。', 'サーバーでgzipまたはbrotli圧縮を有効にしてください。', ok.filter((p) => p.contentEncoding === '' && p.bytes > 20000).map((p) => p.url));

  // ---------- モバイル・ソーシャル・構造化データ ----------
  add('viewport', 'error', 'モバイル', 'viewport が設定されていない', 'スマホで縮小表示され、モバイルフレンドリーではありません。', '<meta name="viewport" content="width=device-width, initial-scale=1"> を設定してください。', ok.filter((p) => !p.viewport).map((p) => p.url));
  add('og-missing', 'notice', 'ソーシャル', 'OGP（og:title / og:image）が不足', 'SNSで共有された時の表示が崩れます。', 'og:title, og:description, og:image, og:url, og:type を設定してください。', ok.filter((p) => !p.og?.title || !p.og?.image).map((p) => p.url));
  add('jsonld-error', 'error', '構造化データ', 'JSON-LD の構文エラー', '構造化データ全体が無視されます。', 'JSONの構文（カンマ・引用符）を修正してください。', ok.filter((p) => (p.jsonldErrors || []).length).map((p) => p.url));
  add('jsonld-none', 'notice', '構造化データ', '構造化データがないページ', 'リッチリザルトやAIのエンティティ理解の機会を逃しています。', '生成ファイルの JSON-LD（BreadcrumbList / Organization / Article / FAQPage）を設置してください。', ok.filter((p) => !(p.jsonld || []).length && !(p.microdataTypes || []).length).map((p) => p.url));

  // スコア：ページ数に対する影響割合で減点（Ahrefs Health Score に近い考え方）
  const base = Math.max(ok.length, 1);
  const errorPages = new Set(issues.filter((i) => i.severity === 'error').flatMap((i) => i.urls));
  const health = Math.round(100 * (1 - Math.min(errorPages.size, base) / base));
  let penalty = 0;
  for (const i of issues) penalty += SEV_WEIGHT[i.severity] * Math.min(1, i.count / base);
  const score = Math.max(0, Math.round(100 - penalty * 2.2));

  issues.sort((a, b) => SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity] || b.count - a.count);
  const summary = { error: 0, warning: 0, notice: 0 };
  for (const i of issues) summary[i.severity]++;
  return { issues, summary, score, health, brokenLinks: { internal: brokenInt, external: brokenExt } };
}

function groupDup(items, key) {
  const m = new Map();
  for (const p of items) {
    const k = key(p).trim();
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p.url);
  }
  return [...m.values()].filter((g) => g.length > 1);
}

function hasSkip(headings) {
  let prev = 0;
  for (const h of headings) {
    if (prev && h.level > prev + 1) return true;
    prev = h.level;
  }
  return false;
}
