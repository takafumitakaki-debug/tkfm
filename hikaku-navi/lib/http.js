// 外部APIを叩くための小さなヘルパー（タイムアウト・JSON化・エラー整形）
const DEFAULT_TIMEOUT_MS = 8000;

async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'hikaku-navi/0.1', Accept: 'application/json', ...headers },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchJson };
