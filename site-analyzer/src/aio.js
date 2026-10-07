// AI検索対策（LLMO / GEO / AIO）：チャンク設計・AIクローラー可否・llms.txt・構造化データ・E-E-A-T
import { AI_BOTS, isAllowed } from './crawler.js';

const VAGUE_HEADINGS = /^(概要|はじめに|さいごに|最後に|まとめ|詳細|その他|特徴|ポイント|メリット|デメリット|について|ご案内|お知らせ|introduction|overview|summary|details?|features?|more|others?)$/i;
const DEPENDENT_START = /^(これ|それ|あれ|この|その|あの|こちら|上記|下記|前述|後述|同様|また|さらに|しかし|ただし|なお|一方|そのため|そこで|this|that|these|those|it|they|also|however|moreover)[はがもをのにで、,\s]/i;
const DEFINITION = /(とは|は[^。]{1,40}(です|である|のこと|を指します|を意味します))|( is an? | refers to | means )/i;
const NUMERIC = /\d+(\.\d+)?\s?(%|％|円|件|社|人|年|ヶ月|か月|日|時間|分|倍|kg|km|万|億)/;

/** チャンク単体の評価。AIが引用しやすい「自己完結した塊」かを見る */
export function evaluateChunk(c, pageTopic = '') {
  const issues = [];
  let score = 100;
  const firstSentence = (c.text.split(/[。.!?！？\n]/)[0] || '').trim();
  const body = c.text.replace(/^・/gm, '');
  if (c.level === 0 && c.chars > 0) { issues.push('見出しの外にある本文（どのトピックか不明）'); score -= 10; }
  if (c.level > 0 && !c.text) { issues.push('見出しのみで本文がない'); score -= 30; }
  if (c.chars > 0 && c.chars < 80) { issues.push(`本文が短すぎる（${c.chars}字）：単独で回答として引用されにくい`); score -= 20; }
  if (c.chars > 1200) { issues.push(`長すぎる（${c.chars}字）：1チャンク300〜800字を目安に小見出しで分割`); score -= 20; }
  else if (c.chars > 800) { issues.push(`やや長い（${c.chars}字）：小見出しでの分割を検討`); score -= 8; }
  if (c.level > 0 && (VAGUE_HEADINGS.test(c.heading.trim()) || c.heading.length <= 3)) { issues.push(`見出し「${c.heading}」が抽象的：何についての段落か見出しだけで分かるように`); score -= 15; }
  if (DEPENDENT_START.test(body.trim())) { issues.push('指示語・接続詞で始まる：前の段落がないと意味が通らない（自己完結していない）'); score -= 15; }
  if (c.chars >= 150 && c.lists === 0 && c.tables === 0 && c.paragraphs <= 1) { issues.push('段落が1つの長文：箇条書き・表で構造化するとAIが抽出しやすい'); score -= 5; }
  const hasDefinition = DEFINITION.test(c.text);
  const hasNumber = NUMERIC.test(c.text);
  const questionHeading = /[?？]$|とは|ですか|ますか|方法|やり方|違い|理由|なぜ|どう|いくら|how|what|why|which/i.test(c.heading);
  if (pageTopic && c.chars > 200 && !c.text.includes(pageTopic) && !c.heading.includes(pageTopic)) { issues.push(`主題「${pageTopic}」がチャンク内に出てこない：単独で読まれた時に何の話か分からない`); score -= 5; }
  return {
    ...c,
    text: c.text.slice(0, 1500),
    firstSentence: firstSentence.slice(0, 120),
    hasDefinition, hasNumber, questionHeading,
    score: Math.max(0, score),
    issues,
  };
}

/** 長いチャンクの分割案・見出しの書き換え案を機械的に提示 */
export function suggestChunkRewrite(c, pageTopic) {
  const sug = [];
  if (c.level > 0 && (VAGUE_HEADINGS.test(c.heading.trim()) || c.heading.length <= 3)) {
    const t = pageTopic || 'このテーマ';
    const map = { 概要: `${t}とは？概要を解説`, 特徴: `${t}の特徴は？3つのポイント`, メリット: `${t}のメリットは？`, デメリット: `${t}のデメリット・注意点は？`, まとめ: `${t}のまとめ：要点と次にやること`, はじめに: `${t}で分かること`, 詳細: `${t}の詳細（料金・期間・対象）`, ポイント: `${t}で押さえるべきポイント` };
    const h = c.heading.trim();
    const proposal = map[h] || (h.includes(t) || t.includes(h) ? `${h}：何が分かるか・誰向けかを具体的に（例：「${h}の選び方と事例」）` : `${t}の${h}`);
    sug.push(`見出し案：「${proposal}」（質問形・主語入りにする）`);
  }
  if (c.chars > 800) {
    const sentences = c.text.split(/(?<=[。.!?！？])\s*/).filter(Boolean);
    const per = Math.ceil(sentences.length / Math.ceil(c.chars / 500));
    const parts = [];
    for (let i = 0; i < sentences.length; i += per) parts.push(sentences.slice(i, i + per).join('').slice(0, 40) + '…');
    sug.push(`分割案：${parts.length}つの小見出し（h3）に分ける → ${parts.map((p, i) => `[${i + 1}] ${p}`).join(' / ')}`);
  }
  if (DEPENDENT_START.test(c.text.trim())) sug.push(`冒頭を主語入りの結論文にする：「${pageTopic || '◯◯'}は、〜です。」で始め、指示語を具体名詞に置き換える`);
  if (!c.hasDefinition && c.level > 0 && c.chars > 100) sug.push(`冒頭1文で結論を述べる（結論ファースト）：「${c.heading.replace(/[?？]$/, '')}は〜です。」`);
  if (c.chars >= 150 && c.lists === 0 && c.tables === 0) sug.push('要素の列挙・比較は箇条書き（ul/ol）か表（table）に変換する');
  return sug;
}

export function analyzeAIO(crawlResult, keywords) {
  const pages = crawlResult.pages.filter((p) => p.title !== undefined && !p.isRedirect);

  // AIクローラーの許可状況
  const bots = AI_BOTS.map((b) => ({ ...b, allowed: isAllowed(crawlResult.robots, b.ua, crawlResult.home), explicitlyMentioned: !!crawlResult.robots?.groups.some((g) => g.agents.includes(b.ua.toLowerCase())) }));

  // サイト全体の構造化データ
  const types = new Map();
  for (const p of pages) for (const j of p.jsonld || []) for (const t of j.type.split(',')) types.set(t, (types.get(t) || 0) + 1);
  const hasOrg = types.has('Organization') || types.has('LocalBusiness') || [...types.keys()].some((t) => /Business|Corporation|Store|Restaurant/.test(t));
  const hasWebSite = types.has('WebSite');
  const hasBreadcrumb = types.has('BreadcrumbList');
  const hasFAQ = types.has('FAQPage');

  // ページ別チャンク評価
  const pageResults = pages.map((p) => {
    const topic = keywords.pageKeywords[p.url]?.[0]?.term || '';
    const chunks = (p.chunks || []).map((c) => {
      const e = evaluateChunk(c, topic);
      e.suggestions = suggestChunkRewrite(e, topic);
      return e;
    });
    const avg = chunks.length ? Math.round(chunks.reduce((s, c) => s + c.score, 0) / chunks.length) : 0;
    const checks = {
      structuredData: (p.jsonld || []).length > 0,
      headingsStructured: (p.headings || []).filter((h) => h.level === 2).length >= 2,
      hasDate: !!(p.dateHints?.published || p.dateHints?.modified || p.lastModified),
      hasAuthor: !!p.author,
      hasQA: p.faqLike > 0,
      mainLandmark: p.mainDetected,
      textEnough: p.textLength >= 600,
      notNoindex: !/noindex/.test(p.robotsMeta + ' ' + p.xRobots),
      definitions: chunks.some((c) => c.hasDefinition),
      facts: chunks.some((c) => c.hasNumber),
    };
    const checkScore = Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100;
    return { url: p.url, title: p.title, topic, chunkCount: chunks.length, chunkScore: avg, checks, score: Math.round(avg * 0.6 + checkScore * 0.4), chunks };
  });

  const siteChecks = [
    { label: 'llms.txt が設置されている', ok: !!crawlResult.llmsTxt, how: '生成ファイルの llms.txt をサイトルート（/llms.txt）に配置してください。AIにサイトの要約と重要ページを伝える新しい標準です。' },
    { label: 'robots.txt が存在する', ok: !!crawlResult.robotsTxt, how: '生成ファイルの robots.txt を配置してください。' },
    { label: 'AI検索系クローラー（OAI-SearchBot / Claude-SearchBot / PerplexityBot）を許可', ok: bots.filter((b) => /SearchBot|Perplexity/.test(b.ua)).every((b) => b.allowed), how: 'AI検索で引用されたい場合、検索系ボットは許可してください（学習用ボットのみ拒否する選択も可能）。' },
    { label: 'Googlebot / Bingbot を許可（AI Overviews・Copilotの前提）', ok: bots.filter((b) => /Googlebot|Bingbot/.test(b.ua)).every((b) => b.allowed), how: 'robots.txt で検索エンジンをブロックしていないか確認してください。' },
    { label: 'Organization（組織情報）の構造化データ', ok: hasOrg, how: 'トップページに Organization の JSON-LD（名称・ロゴ・所在地・sameAs）を設置し、AIがエンティティとして認識できるようにします。' },
    { label: 'WebSite の構造化データ', ok: hasWebSite, how: 'トップページに WebSite の JSON-LD を設置してください。' },
    { label: 'BreadcrumbList（パンくず）の構造化データ', ok: hasBreadcrumb, how: '全下層ページに BreadcrumbList の JSON-LD を設置し、サイト内の位置関係を明示します。' },
    { label: 'FAQPage など Q&A 形式のコンテンツ', ok: hasFAQ || pages.some((p) => p.faqLike >= 3), how: 'ユーザーの質問をそのまま見出し（h2/h3）にし、直下に簡潔な回答を置いたFAQセクションを用意します。' },
    { label: 'sitemap.xml が存在する', ok: crawlResult.sitemap.count > 0, how: '生成ファイルの sitemap.xml を配置し、robots.txt に Sitemap: 行を追加してください。' },
  ];

  const siteScore = Math.round(
    (siteChecks.filter((c) => c.ok).length / siteChecks.length) * 40 +
    (pageResults.length ? pageResults.reduce((s, p) => s + p.score, 0) / pageResults.length : 0) * 0.6,
  );

  return { bots, structuredTypes: Object.fromEntries(types), siteChecks, pages: pageResults, score: siteScore };
}
