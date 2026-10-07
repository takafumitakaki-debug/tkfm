// 使い方:
//   node generate.mjs image --label 名前 --prompt "..." --out output/a.png [--ref ref.png] [--aspect 16:9] [--size 2K] --confirmed
//   node generate.mjs video --label 名前 --prompt "..." --out output/a.mp4 [--ref first.png] --confirmed
// --confirmed は見積りに OK をもらったあとにだけ付ける。
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { MODELS, MAX_ATTEMPTS, client, loadJobs, saveJobs, fetchResult } from './lib.mjs';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    label: { type: 'string' },
    prompt: { type: 'string' },
    out: { type: 'string' },
    ref: { type: 'string', multiple: true, default: [] },
    aspect: { type: 'string' },
    size: { type: 'string' },
    confirmed: { type: 'boolean', default: false },
  },
});

const kind = positionals[0];
if (!MODELS[kind] || !values.label || !values.prompt || !values.out) {
  console.error('必要: image|video, --label, --prompt, --out');
  process.exit(1);
}
if (!values.confirmed) {
  console.error('見積りの OK がまだです。--confirmed なしでは生成しません。');
  process.exit(1);
}

const jobs = loadJobs();
const attempts = jobs.filter((j) => j.label === values.label).length;
if (attempts >= MAX_ATTEMPTS) {
  console.error(`「${values.label}」はすでに ${attempts} 回生成しています。作り直しの上限なので相談してください。`);
  process.exit(1);
}

const mime = (f) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[f.slice(f.lastIndexOf('.')).toLowerCase()];
const input = [
  { type: 'text', text: values.prompt },
  ...values.ref.map((f) => ({ type: 'image', mime_type: mime(f), data: fs.readFileSync(f).toString('base64') })),
];

const generation_config = {};
if (kind === 'image' && (values.aspect || values.size)) {
  generation_config.image_config = { aspect_ratio: values.aspect, image_size: values.size };
}

const ai = client();
// background で投げ、ID をすぐ記録する。通信が切れても fetch.mjs で取りに行ける。
const started = await ai.interactions.create({
  model: MODELS[kind],
  input,
  response_modalities: [kind],
  generation_config,
  background: true,
});
const job = { id: started.id, kind, label: values.label, model: MODELS[kind], prompt: values.prompt, refs: values.ref, out: values.out, createdAt: new Date().toISOString(), status: 'started' };
jobs.push(job);
saveJobs(jobs);
console.log(`開始: ${job.id} (${values.label} ${attempts + 1}回目)`);

const result = await fetchResult(ai, job);
Object.assign(job, { status: result.status, saved: result.saved, usage: result.usage });
saveJobs(jobs);
console.log(result.status === 'completed' ? `保存: ${result.saved.join(', ')}` : `結果: ${result.status}`);
