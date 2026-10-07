// 生成まわりの共通処理。モデル名はここで固定し、勝手に切り替えない。
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';

export const MODELS = {
  image: 'gemini-3-pro-image',        // Nano Banana Pro
  video: 'gemini-omni-flash-preview', // Gemini Omni
};

const JOBS_FILE = new URL('./jobs.json', import.meta.url);
export const MAX_ATTEMPTS = 3; // 初回 + 作り直し2回

export function client() {
  // キーは環境変数から読むだけ。中身は表示・保存しない。
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY が設定されていません');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export function loadJobs() {
  return fs.existsSync(JOBS_FILE) ? JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')) : [];
}

export function saveJobs(jobs) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2) + '\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 生成済みの結果を取りに行く。作り直しはしない。
export async function fetchResult(ai, job) {
  for (;;) {
    const it = await ai.interactions.get(job.id);
    if (it.status === 'completed') {
      const media = (it.outputs ?? []).filter((o) => o.type === job.kind && (o.data || o.uri));
      if (!media.length) throw new Error(`完了したが ${job.kind} が含まれていない (${job.id})`);
      const saved = [];
      for (const [i, o] of media.entries()) {
        const out = media.length === 1 ? job.out : job.out.replace(/(\.\w+)$/, `-${i + 1}$1`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        if (o.data) {
          fs.writeFileSync(out, Buffer.from(o.data, 'base64'));
        } else {
          // uri で返る場合はキー付きで取得する(キーはヘッダーで渡すだけ)
          const res = await fetch(o.uri, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY } });
          if (!res.ok) throw new Error(`ダウンロード失敗 ${res.status} (${job.id})`);
          fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
        }
        saved.push(out);
      }
      return { status: 'completed', saved, usage: it.usage };
    }
    if (['failed', 'cancelled'].includes(it.status)) return { status: it.status };
    process.stdout.write(`  ${job.id}: ${it.status}...\n`);
    await sleep(job.kind === 'video' ? 15000 : 5000);
  }
}
