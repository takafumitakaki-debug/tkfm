// 失敗したように見えた生成の結果を取りに行く(作り直しはしない)。
//   node fetch.mjs            … 完了していないジョブを全部確認
//   node fetch.mjs <ID>       … 指定したジョブだけ確認
import { client, loadJobs, saveJobs, fetchResult } from './lib.mjs';

const jobs = loadJobs();
const targets = process.argv[2]
  ? jobs.filter((j) => j.id === process.argv[2])
  : jobs.filter((j) => j.status !== 'completed');
if (!targets.length) {
  console.log('確認が必要なジョブはありません');
  process.exit(0);
}

const ai = client();
for (const job of targets) {
  try {
    const result = await fetchResult(ai, job);
    Object.assign(job, { status: result.status, saved: result.saved, usage: result.usage });
    console.log(`${job.label}: ${result.status}${result.saved ? ' → ' + result.saved.join(', ') : ''}`);
  } catch (e) {
    console.log(`${job.label}: 取得できず (${e.message})`);
  }
  saveJobs(jobs);
}
