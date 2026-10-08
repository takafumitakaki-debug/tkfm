// 曖昧な検索語を Claude に解釈させる（任意機能）。
// ANTHROPIC_API_KEY（または AI_QUERY=1 と ant auth login 等の認証）がある場合だけ動く。
// 失敗・未設定時は null を返し、ルールベースの推測だけで検索を続ける。
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
const cache = new Map();
let client = null;

function enabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.AI_QUERY === '1');
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['product', 'brand', 'category', 'searchQueries', 'mustInclude', 'note'],
  properties: {
    product: { type: 'string', description: '推測した正式な商品名（日本で一般的な表記）' },
    brand: { type: 'string', description: 'メーカー名。不明なら空文字' },
    category: { type: 'string', description: '商品カテゴリ（例: サッカースパイク）' },
    searchQueries: {
      type: 'array',
      items: { type: 'string' },
      description: 'ECサイト検索に使う語を有望な順に3〜5個。カナ表記・英字表記・型番の揺れを含める。サイズ等の条件は含めない',
    },
    mustInclude: {
      type: 'array',
      items: { type: 'string' },
      description: '同じ商品か判定するために商品名に含まれるべき語（表記揺れごとに1語）',
    },
    note: { type: 'string', description: '入力の誤字・表記揺れをどう解釈したか、一文で' },
  },
};

const SYSTEM = `あなたは日本のEC検索アシスタントです。ユーザーが入力した曖昧・誤記を含む商品名から、
実在する商品を推測し、楽天市場やYahoo!ショッピングで見つけやすい検索語を返します。
入力のサイズ・容量・色などの条件は検索語から外してください（呼び出し側で絞り込みます）。
確信が持てない場合も最も可能性の高い解釈を返し、noteにその旨を書いてください。`;

async function interpretQuery(raw) {
  if (!enabled()) return null;
  if (cache.has(raw)) return cache.get(raw);
  client = client || new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `入力: ${raw}` }],
    });
    if (response.stop_reason !== 'end_turn') return null;
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const result = JSON.parse(text);
    cache.set(raw, result);
    return result;
  } catch (err) {
    if (err instanceof SyntaxError) console.warn('[ai] JSONの解析に失敗:', err.message);
    else if (err instanceof Anthropic.RateLimitError) console.warn('[ai] レート制限のためスキップ');
    else if (err instanceof Anthropic.APIError) console.warn(`[ai] APIエラー ${err.status}: ${err.message}`);
    else console.warn('[ai] 解釈に失敗:', err.message);
    return null;
  }
}

module.exports = { interpretQuery, enabled };
